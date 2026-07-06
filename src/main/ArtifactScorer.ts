/*
 * ArtifactScorer
 * --------------
 * Weighted linear scoring of artefacts observed during a task, combining
 * foreground duration, access frequency, and recency:
 *
 *   score(a) = w1 * normalized_duration(a)
 *            + w2 * log(1 + access_count(a))
 *            + w3 * recency_decay(a)
 *
 * where
 *   normalized_duration = total foreground focus time on a / total session time
 *   access_count        = distinct focus switches to a (log-dampened)
 *   recency_decay       = e^(-lambda * active_minutes_since_last_access),
 *                         measured on the task's active-time clock so idle
 *                         stretches and gaps between sessions don't age recency.
 *
 * On top of this behavioral score, a **semantic** relevance factor multiplies
 * the result:
 *
 *   score(a) = behavioral(a) * ((1 - influence) + influence * semantic(a))
 *
 * where semantic(a) in [0,1] is the artefact's content similarity to the task
 * (see SemanticScorer) and `influence` (0..1) dials how strongly it modulates.
 * influence = 0 leaves the behavioral score untouched (semantic collected but
 * not driving); influence = 1 multiplies by semantic in full.
 *
 * Weights / lambda / influence / selection threshold live in StaticSettings so
 * they can be tuned against the Study 1 ground truth.
 */

import StaticSettings from './StaticSettings';

export type ScoreInput = {
  totalDurationMs: number;
  accessCount: number;
  /** Epoch ms of the last access; 0 means "never" (recency guard only). */
  lastAccessMs: number;
  /** Last-access position on the task's cumulative active-time clock (ms). */
  lastAccessActiveMs: number;
  /**
   * Share of total interactions (clicks + keystrokes) this artefact received,
   * relative to all tracked non-never-close artefacts. Already in [0,1].
   * Defaults to 0 when not provided.
   */
  interactionShare?: number;
  /**
   * Semantic relevance in [0,1] (content similarity to the task theme).
   * Defaults to 1 (neutral) when unavailable, so it doesn't change the score.
   */
  semanticSimilarity?: number;
};

export default class ArtifactScorer {
  /**
   * Compute the weighted linear score for one artefact.
   * @param totalSessionMs accumulated active time for the task (denominator)
   * @param nowActiveMs the task's total active-time elapsed — the reference the
   *   recency decay is measured back from (NOT wall-clock).
   */
  public static score(
    input: ScoreInput,
    totalSessionMs: number,
    nowActiveMs: number
  ): number {
    return (
      this.behavioralScore(input, totalSessionMs, nowActiveMs) *
      this.semanticFactor(input.semanticSimilarity)
    );
  }

  /**
   * The behavioral part only (duration + frequency + recency + interaction),
   * without the semantic multiplier. Used both as the score's base and as the
   * weight for the semantic centroid (so core artefacts define the theme).
   */
  public static behavioralScore(
    input: ScoreInput,
    totalSessionMs: number,
    nowActiveMs: number
  ): number {
    const w1 = StaticSettings.SCORE_WEIGHT_DURATION;
    const w2 = StaticSettings.SCORE_WEIGHT_FREQUENCY;
    const w3 = StaticSettings.SCORE_WEIGHT_RECENCY;
    const w4 = StaticSettings.SCORE_WEIGHT_INTERACTION;
    const lambda = StaticSettings.SCORE_DECAY_LAMBDA;

    const normalizedDuration =
      totalSessionMs > 0
        ? Math.min(1, input.totalDurationMs / totalSessionMs)
        : 0;
    const frequency = Math.log(1 + Math.max(0, input.accessCount));
    // Decay over ACTIVE time since last access (idle / between-session gaps add
    // nothing). Guard with the epoch timestamp: 0 means the artefact never
    // qualified for recency, so it scores 0 rather than e^0 = 1.
    const recency =
      input.lastAccessMs > 0
        ? Math.exp(
            (-lambda * Math.max(0, nowActiveMs - input.lastAccessActiveMs)) /
              60000
          )
        : 0;
    // Already normalized to [0,1] by the caller (share of total interactions).
    const interaction = Math.min(1, Math.max(0, input.interactionShare ?? 0));

    return (
      w1 * normalizedDuration +
      w2 * frequency +
      w3 * recency +
      w4 * interaction
    );
  }

  /**
   * Multiplicative semantic modifier: (1 - influence) + influence * semantic.
   * `semantic` defaults to 1 (neutral); influence = 0 -> factor 1 (no effect).
   */
  public static semanticFactor(semanticSimilarity?: number): number {
    const influence = Math.min(
      1,
      Math.max(0, StaticSettings.SCORE_SEMANTIC_INFLUENCE)
    );
    const s = Math.min(1, Math.max(0, semanticSimilarity ?? 1));
    return 1 - influence + influence * s;
  }

  /**
   * Given key -> score, return the keys to auto-select: those scoring at least
   * SCORE_SELECT_THRESHOLD * maxScore. Empty when there are no positive scores.
   */
  public static selectAboveThreshold(scores: Map<string, number>): Set<string> {
    const selected = new Set<string>();
    let max = 0;
    scores.forEach((v) => {
      if (v > max) max = v;
    });
    if (max <= 0) return selected;
    const cutoff = StaticSettings.SCORE_SELECT_THRESHOLD * max;
    scores.forEach((v, k) => {
      if (v >= cutoff) selected.add(k);
    });
    return selected;
  }
}
