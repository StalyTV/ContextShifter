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
 *   recency_decay       = e^(-lambda * minutes_since_last_access), measured at
 *                         the task-switch moment.
 *
 * Weights / lambda / selection threshold live in StaticSettings so they can be
 * tuned against the Study 1 ground truth.
 */

import StaticSettings from './StaticSettings';

export type ScoreInput = {
  totalDurationMs: number;
  accessCount: number;
  /** Epoch ms of the last interaction; 0/undefined means "never". */
  lastAccessMs: number;
  /**
   * Share of total interactions (clicks + keystrokes) this artefact received,
   * relative to all tracked non-never-close artefacts. Already in [0,1].
   * Defaults to 0 when not provided.
   */
  interactionShare?: number;
};

export default class ArtifactScorer {
  /**
   * Compute the weighted linear score for one artefact.
   * @param totalSessionMs accumulated active time for the task (denominator)
   * @param nowMs the task-switch moment used for recency decay
   */
  public static score(
    input: ScoreInput,
    totalSessionMs: number,
    nowMs: number
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
    const recency =
      input.lastAccessMs > 0
        ? Math.exp((-lambda * Math.max(0, nowMs - input.lastAccessMs)) / 60000)
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
