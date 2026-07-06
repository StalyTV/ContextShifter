/*
 * ScoreWeights
 * ------------
 * Runtime-editable artefact-scoring weights (w1..w4 + lambda). The live values
 * live on StaticSettings (which ArtifactScorer reads), are persisted in the
 * Settings key-value table, and are loaded on startup. Updating them re-scores
 * every task's stored artefacts so existing tasks reflect the new weights, and
 * future task stops use them automatically.
 */

import { info, warn } from 'electron-log';
import StaticSettings from './StaticSettings';
import Settings from './entity/Settings';
import { Database } from './database';
import ArtifactScorer, { ScoreInput } from './ArtifactScorer';
import ArtifactUsage from './entity/ArtifactUsage';
import Snapshot from './entity/Snapshot';
import KnownApplication from './entity/KnownApplication';
import NeverCloseBrowserTab from './entity/NeverCloseBrowserTab';
import artefactText from './scoring/artefactText';
import SemanticScorer, { SemanticInput } from './scoring/SemanticScorer';

export type ScoreWeights = {
  duration: number; // w1
  frequency: number; // w2
  recency: number; // w3
  interaction: number; // w4
  lambda: number; // recency decay rate
  semantic: number; // semantic influence α (multiplicative), 0..1
};

const KEYS = {
  duration: 'scoreWeightDuration',
  frequency: 'scoreWeightFrequency',
  recency: 'scoreWeightRecency',
  interaction: 'scoreWeightInteraction',
  lambda: 'scoreDecayLambda',
  semantic: 'scoreSemanticInfluence',
} as const;

function num(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export default class ScoreWeightsManager {
  /** Current live weights (as held on StaticSettings). */
  static get(): ScoreWeights {
    return {
      duration: StaticSettings.SCORE_WEIGHT_DURATION,
      frequency: StaticSettings.SCORE_WEIGHT_FREQUENCY,
      recency: StaticSettings.SCORE_WEIGHT_RECENCY,
      interaction: StaticSettings.SCORE_WEIGHT_INTERACTION,
      lambda: StaticSettings.SCORE_DECAY_LAMBDA,
      semantic: StaticSettings.SCORE_SEMANTIC_INFLUENCE,
    };
  }

  private static apply(w: ScoreWeights): void {
    StaticSettings.SCORE_WEIGHT_DURATION = w.duration;
    StaticSettings.SCORE_WEIGHT_FREQUENCY = w.frequency;
    StaticSettings.SCORE_WEIGHT_RECENCY = w.recency;
    StaticSettings.SCORE_WEIGHT_INTERACTION = w.interaction;
    StaticSettings.SCORE_DECAY_LAMBDA = w.lambda;
    StaticSettings.SCORE_SEMANTIC_INFLUENCE = w.semantic;
  }

  private static sanitize(w: ScoreWeights): ScoreWeights {
    const cur = this.get();
    return {
      duration: Math.max(0, num(w.duration, cur.duration)),
      frequency: Math.max(0, num(w.frequency, cur.frequency)),
      recency: Math.max(0, num(w.recency, cur.recency)),
      interaction: Math.max(0, num(w.interaction, cur.interaction)),
      lambda: Math.max(0, num(w.lambda, cur.lambda)),
      semantic: Math.min(1, Math.max(0, num(w.semantic, cur.semantic))),
    };
  }

  /** Load persisted weights into StaticSettings (call once on startup). */
  static async load(): Promise<void> {
    try {
      const cur = this.get();
      const read = async (key: string, def: number) =>
        num((await Settings.findOneBy({ key }))?.value, def);
      this.apply({
        duration: await read(KEYS.duration, cur.duration),
        frequency: await read(KEYS.frequency, cur.frequency),
        recency: await read(KEYS.recency, cur.recency),
        interaction: await read(KEYS.interaction, cur.interaction),
        lambda: await read(KEYS.lambda, cur.lambda),
        semantic: await read(KEYS.semantic, cur.semantic),
      });
      info(`[ScoreWeights] Loaded ${JSON.stringify(this.get())}`);
    } catch (err) {
      warn(`[ScoreWeights] load failed: ${String(err)}`);
    }
  }

  /**
   * Apply + persist new weights, then re-score every task's stored artefacts.
   * Returns the number of tasks re-scored.
   */
  static async update(weights: ScoreWeights): Promise<number> {
    const clean = this.sanitize(weights);
    this.apply(clean);
    await Promise.all([
      Database.manager.save(Settings, {
        key: KEYS.duration,
        value: String(clean.duration),
      }),
      Database.manager.save(Settings, {
        key: KEYS.frequency,
        value: String(clean.frequency),
      }),
      Database.manager.save(Settings, {
        key: KEYS.recency,
        value: String(clean.recency),
      }),
      Database.manager.save(Settings, {
        key: KEYS.interaction,
        value: String(clean.interaction),
      }),
      Database.manager.save(Settings, {
        key: KEYS.lambda,
        value: String(clean.lambda),
      }),
      Database.manager.save(Settings, {
        key: KEYS.semantic,
        value: String(clean.semantic),
      }),
    ]);
    const rescored = await this.recomputeAll();
    info(
      `[ScoreWeights] Updated to ${JSON.stringify(clean)}; re-scored ${rescored} task(s)`
    );
    return rescored;
  }

  /**
   * Re-score every task's stored ArtifactUsage rows with the current weights.
   * Recency is measured relative to each task's stop time (or its latest access)
   * so re-scoring reflects the weight change, not elapsed real time.
   */
  static async recomputeAll(): Promise<number> {
    const neverCloseApps =
      await KnownApplication.getAppsThatShouldNeverBeClosed();
    const ncPaths = new Set(neverCloseApps.map((a) => a.path));
    const ncNames = new Set(neverCloseApps.map((a) => a.name.toLowerCase()));
    const ncTabUrls = await NeverCloseBrowserTab.getUrlSet();
    const isNeverClose = (r: ArtifactUsage): boolean => {
      if (r.kind === 'tab') return ncTabUrls.has(r.url);
      if (r.kind === 'app' || r.kind === 'ide') {
        return (
          (!!r.path && ncPaths.has(r.path)) ||
          (!!r.name && ncNames.has(r.name.toLowerCase()))
        );
      }
      return false;
    };

    const snapshots = await Snapshot.find();
    let count = 0;
    for (const snap of snapshots) {
      // eslint-disable-next-line no-await-in-loop
      const rows = await ArtifactUsage.getForSnapshot(snap.id);
      if (rows.length === 0) continue;

      const totalSessionMs = snap.activeMs ?? 0;
      const lastAccessMsOf = (r: ArtifactUsage) =>
        r.lastAccessTs ? Date.parse(r.lastAccessTs) : 0;
      // Recency decays over the task's total active time (sum of idle-capped
      // durations), measured back from that same total — matching live scoring.
      const nowActiveMs = rows.reduce(
        (s, r) => s + (r.totalDurationMs ?? 0),
        0
      );

      const totalInteractions = rows
        .filter((r) => !isNeverClose(r))
        .reduce((s, r) => s + (r.interactionCount ?? 0), 0);

      // Pass 1: behavioral inputs + scores + text (reused as the centroid weight).
      const inputByKey = new Map<string, ScoreInput>();
      const behavioralByKey = new Map<string, number>();
      const textByKey = new Map<string, string>();
      for (const r of rows) {
        const lastAccessMs = lastAccessMsOf(r);
        const input: ScoreInput = {
          totalDurationMs: r.totalDurationMs ?? 0,
          accessCount: r.accessCount ?? 0,
          lastAccessMs: Number.isNaN(lastAccessMs) ? 0 : lastAccessMs,
          lastAccessActiveMs: r.lastAccessActiveMs ?? 0,
          interactionShare:
            isNeverClose(r) || totalInteractions <= 0
              ? 0
              : (r.interactionCount ?? 0) / totalInteractions,
        };
        inputByKey.set(r.key, input);
        behavioralByKey.set(
          r.key,
          ArtifactScorer.behavioralScore(input, totalSessionMs, nowActiveMs)
        );
        textByKey.set(
          r.key,
          artefactText({
            kind: r.kind,
            name: r.name,
            path: r.path,
            url: r.url,
            title: r.title,
          })
        );
      }

      // Pass 2: semantic similarity, reusing cached embeddings.
      const semInputs: SemanticInput[] = rows.map((r) => {
        const text = textByKey.get(r.key) ?? '';
        let cachedEmbedding: number[] | null = null;
        if (r.embedding && r.embeddedText === text) {
          try {
            cachedEmbedding = JSON.parse(r.embedding);
          } catch {
            cachedEmbedding = null;
          }
        }
        return { key: r.key, text, weight: behavioralByKey.get(r.key) ?? 0, cachedEmbedding };
      });
      // eslint-disable-next-line no-await-in-loop
      const semantic = await SemanticScorer.similarities(semInputs);

      for (const r of rows) {
        const sem = semantic.get(r.key);
        const input = inputByKey.get(r.key)!;
        input.semanticSimilarity = sem?.similarity ?? 1;
        r.semanticSimilarity = sem?.similarity ?? 1;
        r.semanticCosine = sem?.cosine ?? null!;
        if (sem?.embedding) {
          r.embedding = JSON.stringify(sem.embedding);
          r.embeddedText = textByKey.get(r.key) ?? '';
        }
        r.score = ArtifactScorer.score(input, totalSessionMs, nowActiveMs);
      }
      // eslint-disable-next-line no-await-in-loop
      await ArtifactUsage.save(rows);
      count += 1;
    }
    return count;
  }
}
