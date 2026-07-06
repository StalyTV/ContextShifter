/*
 * EmbeddingProvider
 * -----------------
 * Local, on-device sentence embeddings for semantic artefact relevance. Loads a
 * small model (all-MiniLM-L6-v2, 384-dim) via Transformers.js on the WASM
 * backend — no native module to rebuild for Electron's ABI, no data leaves the
 * machine, offline after the first model download.
 *
 * Everything here is best-effort: if the model isn't ready (still downloading,
 * failed to load, or disabled) `embed()` returns null and the scorer treats
 * semantic similarity as neutral, so the app never breaks or blocks on it.
 */

import { app } from 'electron';
import { join } from 'path';
import { info, warn } from 'electron-log';
import StaticSettings from '../StaticSettings';

// Hide the import from webpack's static analysis so the (large, ESM-only)
// package is resolved from node_modules at runtime instead of being bundled.
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const dynamicImport: (m: string) => Promise<any> = new Function(
  'm',
  'return import(m)'
) as any;

type Extractor = (
  texts: string[],
  opts: { pooling: 'mean'; normalize: boolean }
) => Promise<{ tolist(): number[][] }>;

export default class EmbeddingProvider {
  private static _instance: EmbeddingProvider;
  private _extractor: Extractor | null = null;
  private _loadPromise: Promise<void> | null = null;
  private _failed = false;
  // text -> vector, so repeated scoring of the same artefacts (e.g. dragging the
  // trim bar) never re-embeds.
  private _cache: Map<string, number[]> = new Map();

  public static getInstance(): EmbeddingProvider {
    return this._instance || (this._instance = new EmbeddingProvider());
  }

  public isReady(): boolean {
    return this._extractor != null;
  }

  /** Kick off model loading in the background (call once at startup to warm). */
  public warmup(): void {
    if (StaticSettings.SEMANTIC_BACKEND === 'off') return;
    // Don't pay the (one-time ~90 MB) download/load unless semantic is actually
    // driving the score. If it's turned on later, embed() lazy-loads on demand.
    if (StaticSettings.SCORE_SEMANTIC_INFLUENCE <= 0) return;
    void this.ensureLoaded();
  }

  private ensureLoaded(): Promise<void> {
    if (this._extractor || this._failed) return Promise.resolve();
    if (this._loadPromise) return this._loadPromise;
    this._loadPromise = this.load();
    return this._loadPromise;
  }

  private async load(): Promise<void> {
    try {
      const { pipeline, env } = await dynamicImport('@huggingface/transformers');
      // Keep model weights in a writable per-user cache; allow the one-time
      // download unless a bundled copy is provided.
      env.cacheDir = join(app.getPath('userData'), 'models');
      env.allowRemoteModels = true;
      const model = StaticSettings.SEMANTIC_MODEL;
      info(`[EmbeddingProvider] loading "${model}" (wasm)…`);
      this._extractor = (await pipeline('feature-extraction', model, {
        device: 'wasm',
      })) as unknown as Extractor;
      info('[EmbeddingProvider] model ready');
    } catch (err) {
      this._failed = true;
      warn(`[EmbeddingProvider] disabled — model load failed: ${String(err)}`);
    }
  }

  /**
   * Embed a batch of texts. Returns one unit-length vector per input, or null
   * if the model isn't available. Empty strings are embedded too (the caller
   * decides how to treat them); callers usually skip blanks upstream.
   */
  public async embed(texts: string[]): Promise<number[][] | null> {
    if (texts.length === 0) return [];
    if (StaticSettings.SEMANTIC_BACKEND === 'off') return null;

    // Serve cache hits; only send the misses to the model.
    const missIdx: number[] = [];
    const missTexts: string[] = [];
    texts.forEach((t, i) => {
      if (!this._cache.has(t)) {
        missIdx.push(i);
        missTexts.push(t);
      }
    });

    if (missTexts.length > 0) {
      await this.ensureLoaded();
      if (!this._extractor) return null;
      try {
        const output = await this._extractor(missTexts, {
          pooling: 'mean',
          normalize: true,
        });
        const vecs = output.tolist();
        missIdx.forEach((origIdx, k) => {
          this._cache.set(texts[origIdx], vecs[k]);
        });
      } catch (err) {
        warn(`[EmbeddingProvider] embed failed: ${String(err)}`);
        return null;
      }
    }

    return texts.map((t) => this._cache.get(t) as number[]);
  }

  /** Cosine similarity of two unit-length vectors (dot product). */
  public static cosine(a: number[], b: number[]): number {
    if (!a || !b || a.length !== b.length) return 0;
    let dot = 0;
    for (let i = 0; i < a.length; i += 1) dot += a[i] * b[i];
    return dot;
  }
}
