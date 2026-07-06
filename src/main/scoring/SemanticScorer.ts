/*
 * SemanticScorer
 * --------------
 * Computes each artefact's semantic relevance to the task as the cosine between
 * its embedding and a behavioral-weighted centroid of all the task's artefacts.
 * The artefacts you actually worked on (high behavioral score) define the
 * centroid/"theme", so an off-topic artefact lands far from it and scores low —
 * i.e. semantic acts mainly as an outlier/contamination detector.
 *
 * Cosines are mapped to [0,1] through a calibratable sigmoid; the raw cosine is
 * returned too so it can be logged and the midpoint tuned from real data.
 *
 * Best-effort: if embeddings are unavailable the similarity is 1 (neutral), so
 * the multiplicative scorer leaves the behavioral score unchanged.
 */

import StaticSettings from '../StaticSettings';
import EmbeddingProvider from './EmbeddingProvider';

export type SemanticInput = {
  key: string;
  text: string;
  /** Behavioral score of this artefact — used to weight the task centroid. */
  weight: number;
  /** Previously-persisted embedding, to skip recomputation. */
  cachedEmbedding?: number[] | null;
};

export type SemanticResult = {
  /** Normalized semantic relevance in [0,1] (1 = neutral when unavailable). */
  similarity: number;
  /** Raw cosine to the centroid, or null when not computed. */
  cosine: number | null;
  /** The embedding used (fresh or cached), so the caller can persist it. */
  embedding: number[] | null;
};

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/** Map a raw cosine to [0,1] via the calibratable sigmoid. */
export function normalizeCosine(cosine: number): number {
  const { SEMANTIC_MIDPOINT: mid, SEMANTIC_TEMPERATURE: temp } = StaticSettings;
  const t = temp <= 0 ? 1e-6 : temp;
  return Math.min(1, Math.max(0, sigmoid((cosine - mid) / t)));
}

export default class SemanticScorer {
  /**
   * @returns key -> { similarity, cosine, embedding }. All neutral (similarity 1)
   *   when the model is unavailable or there aren't enough embeddable artefacts.
   */
  public static async similarities(
    inputs: SemanticInput[]
  ): Promise<Map<string, SemanticResult>> {
    const out = new Map<string, SemanticResult>();
    const neutral = (embedding: number[] | null = null): SemanticResult => ({
      similarity: 1,
      cosine: null,
      embedding,
    });

    if (StaticSettings.SCORE_SEMANTIC_INFLUENCE <= 0) {
      // Semantic off — still return (neutral) so callers are uniform. We skip
      // embedding entirely to avoid the cost when it can't affect the score.
      inputs.forEach((i) => out.set(i.key, neutral(i.cachedEmbedding ?? null)));
      return out;
    }

    // Embed only the texts we don't already have a cached vector for.
    const provider = EmbeddingProvider.getInstance();
    const toEmbed = inputs.filter(
      (i) => !i.cachedEmbedding && i.text.trim().length > 0
    );
    let fresh: number[][] | null = null;
    if (toEmbed.length > 0) {
      fresh = await provider.embed(toEmbed.map((i) => i.text));
    }

    // key -> embedding (cached or freshly computed; null when unavailable).
    const embByKey = new Map<string, number[] | null>();
    let freshIdx = 0;
    for (const i of inputs) {
      if (i.cachedEmbedding) {
        embByKey.set(i.key, i.cachedEmbedding);
      } else if (i.text.trim().length > 0 && fresh) {
        embByKey.set(i.key, fresh[freshIdx] ?? null);
        freshIdx += 1;
      } else {
        embByKey.set(i.key, null);
      }
    }

    const usable = inputs.filter((i) => embByKey.get(i.key));
    if (usable.length < 2) {
      // Not enough to define a meaningful centroid — leave everything neutral.
      inputs.forEach((i) => out.set(i.key, neutral(embByKey.get(i.key) ?? null)));
      return out;
    }

    // Behavioral-weighted centroid (fall back to uniform weights if all zero).
    const dim = (embByKey.get(usable[0].key) as number[]).length;
    const centroid = new Array<number>(dim).fill(0);
    const totalWeight = usable.reduce((s, i) => s + Math.max(0, i.weight), 0);
    const useUniform = totalWeight <= 0;
    for (const i of usable) {
      const emb = embByKey.get(i.key) as number[];
      const w = useUniform ? 1 : Math.max(0, i.weight);
      for (let d = 0; d < dim; d += 1) centroid[d] += w * emb[d];
    }
    // Normalize centroid to unit length so the cosine is a true cosine.
    let norm = 0;
    for (let d = 0; d < dim; d += 1) norm += centroid[d] * centroid[d];
    norm = Math.sqrt(norm) || 1;
    for (let d = 0; d < dim; d += 1) centroid[d] /= norm;

    for (const i of inputs) {
      const emb = embByKey.get(i.key) ?? null;
      if (!emb) {
        out.set(i.key, neutral(null));
        continue;
      }
      const cosine = EmbeddingProvider.cosine(emb, centroid);
      out.set(i.key, {
        similarity: normalizeCosine(cosine),
        cosine,
        embedding: emb,
      });
    }
    return out;
  }
}
