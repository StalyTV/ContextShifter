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
import ArtifactScorer from './ArtifactScorer';
import ArtifactUsage from './entity/ArtifactUsage';
import Snapshot from './entity/Snapshot';
import KnownApplication from './entity/KnownApplication';
import NeverCloseBrowserTab from './entity/NeverCloseBrowserTab';

export type ScoreWeights = {
  duration: number; // w1
  frequency: number; // w2
  recency: number; // w3
  interaction: number; // w4
  lambda: number; // recency decay rate
};

const KEYS = {
  duration: 'scoreWeightDuration',
  frequency: 'scoreWeightFrequency',
  recency: 'scoreWeightRecency',
  interaction: 'scoreWeightInteraction',
  lambda: 'scoreDecayLambda',
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
    };
  }

  private static apply(w: ScoreWeights): void {
    StaticSettings.SCORE_WEIGHT_DURATION = w.duration;
    StaticSettings.SCORE_WEIGHT_FREQUENCY = w.frequency;
    StaticSettings.SCORE_WEIGHT_RECENCY = w.recency;
    StaticSettings.SCORE_WEIGHT_INTERACTION = w.interaction;
    StaticSettings.SCORE_DECAY_LAMBDA = w.lambda;
  }

  private static sanitize(w: ScoreWeights): ScoreWeights {
    const cur = this.get();
    return {
      duration: Math.max(0, num(w.duration, cur.duration)),
      frequency: Math.max(0, num(w.frequency, cur.frequency)),
      recency: Math.max(0, num(w.recency, cur.recency)),
      interaction: Math.max(0, num(w.interaction, cur.interaction)),
      lambda: Math.max(0, num(w.lambda, cur.lambda)),
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
      const maxLastAccess = rows.reduce(
        (m, r) => Math.max(m, lastAccessMsOf(r) || 0),
        0
      );
      const refMs = snap.lastStopTs
        ? Date.parse(snap.lastStopTs)
        : maxLastAccess || Date.now();

      const totalInteractions = rows
        .filter((r) => !isNeverClose(r))
        .reduce((s, r) => s + (r.interactionCount ?? 0), 0);

      for (const r of rows) {
        const lastAccessMs = lastAccessMsOf(r);
        const interactionShare =
          isNeverClose(r) || totalInteractions <= 0
            ? 0
            : (r.interactionCount ?? 0) / totalInteractions;
        r.score = ArtifactScorer.score(
          {
            totalDurationMs: r.totalDurationMs ?? 0,
            accessCount: r.accessCount ?? 0,
            lastAccessMs: Number.isNaN(lastAccessMs) ? 0 : lastAccessMs,
            interactionShare,
          },
          totalSessionMs,
          Number.isNaN(refMs) ? Date.now() : refMs
        );
      }
      // eslint-disable-next-line no-await-in-loop
      await ArtifactUsage.save(rows);
      count += 1;
    }
    return count;
  }
}
