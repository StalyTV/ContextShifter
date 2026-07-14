/*
 * StatsAccumulator
 * ----------------
 * Turns a stream of timestamped focus / interaction / activity events into
 * per-artefact usage stats (foreground duration, qualifying access count,
 * interaction count, last-access time). This is the single place the
 * duration/frequency/recency rules live, so the live session and any trimmed
 * replay of the recorded timeline produce identical numbers.
 *
 * Rules (see StaticSettings):
 *  - Duration is idle-capped: time only accrues up to (last activity + idle
 *    timeout). Mouse-move / scroll / clicks / keystrokes all count as activity.
 *  - A focus visit counts as an "access" only if it lasted >= the access
 *    threshold (frequency gate).
 *  - A focus visit refreshes recency only if it lasted >= the recency threshold
 *    OR had an interaction (interactions refresh recency immediately).
 *
 * Recency is recorded twice: as a wall-clock epoch (lastAccessMs, kept for the
 * study export) and as an offset on an *active-time clock* (lastAccessActiveMs)
 * that only advances while the task is active and not idle — the same idle-cap
 * as duration. Scoring decays recency over active time, so idle stretches (and,
 * once made cumulative across sessions, the gaps between sessions) don't age an
 * artefact's recency.
 */

import StaticSettings from '../StaticSettings';
import { ArtifactKind } from '../entity/ArtifactUsage';

export type UsageStat = {
  kind: ArtifactKind;
  totalDurationMs: number;
  accessCount: number;
  interactionCount: number;
  lastAccessMs: number;
  /** Last-access position on the active-time clock (session-relative here). */
  lastAccessActiveMs: number;
  // Time-decayed frequency/duration accumulators (see StaticSettings.
  // SCORE_HALF_LIFE_MS). Each is a running value `V` valid *as of* its
  // `*ActiveMs` position on the active-time clock; to read it at a later time T
  // decay it: V * 2^(-(T - posActiveMs)/halfLife). Updated incrementally at
  // every access / duration-flush, so *when* each event happened is baked in.
  decayFreq: number;
  decayFreqActiveMs: number;
  decayDur: number;
  decayDurActiveMs: number;
};

export default class StatsAccumulator {
  private _stats: Map<string, UsageStat> = new Map();
  private _focusKey: string | null = null;
  private _focusStart = 0;
  private _lastActivityMs = 0;
  private _lastAccruedMs = 0;
  // Active-time clock: total idle-capped active time accrued so far. Advances
  // in lockstep with the focused artefact's duration (only one accrues at a
  // time), so it equals the sum of all durations.
  private _activeElapsedMs = 0;
  // Active-clock position as of the last real activity (mirrors _lastActivityMs).
  private _lastActivityActiveMs = 0;

  /** Switch focus to `key` at time `t` (closing the previous visit). */
  focus(key: string, kind: ArtifactKind, t: number): void {
    if (this._focusKey === key) return;
    this.closeVisit(t);
    this._focusKey = key;
    this._focusStart = t;
    this._lastActivityMs = t;
    this._lastAccruedMs = t;
    this._lastActivityActiveMs = this._activeElapsedMs;
    if (!this._stats.has(key)) {
      this._stats.set(key, {
        kind,
        totalDurationMs: 0,
        accessCount: 0,
        interactionCount: 0,
        lastAccessMs: 0,
        lastAccessActiveMs: 0,
        decayFreq: 0,
        decayFreqActiveMs: 0,
        decayDur: 0,
        decayDurActiveMs: 0,
      });
    }
  }

  /** Decay factor 2^(-Δ/halfLife) for a Δ (active-ms) gap. */
  private static decayFactor(deltaActiveMs: number): number {
    if (deltaActiveMs <= 0) return 1;
    return Math.pow(2, -deltaActiveMs / StaticSettings.SCORE_HALF_LIFE_MS);
  }

  /** A click / keystroke at time `t` (attributed to the focused artefact). */
  interaction(t: number): void {
    if (!this._focusKey) return;
    const s = this._stats.get(this._focusKey);
    if (!s) return;
    this.markActivity(t);
    s.interactionCount += 1;
    s.lastAccessMs = t;
    s.lastAccessActiveMs = this._lastActivityActiveMs;
  }

  /** Passive activity (mouse-move / scroll) at time `t` — keeps duration alive. */
  activity(t: number): void {
    if (!this._focusKey) return;
    this.markActivity(t);
  }

  /** End the timeline at time `t` (close the current visit, clear focus). */
  end(t: number): void {
    this.closeVisit(t);
    this._focusKey = null;
  }

  /** Snapshot of the accumulated stats (defensive copy). */
  snapshot(): Map<string, UsageStat> {
    const out = new Map<string, UsageStat>();
    for (const [k, v] of this._stats) out.set(k, { ...v });
    return out;
  }

  // ---------- internals (mirror ActiveTaskSession) ----------

  private markActivity(t: number): void {
    this.flush(t);
    this._lastActivityMs = t;
    this._lastAccruedMs = t;
    this._lastActivityActiveMs = this._activeElapsedMs;
  }

  private flush(t: number): void {
    if (!this._focusKey) return;
    const s = this._stats.get(this._focusKey);
    if (!s) return;
    const activeUntil =
      this._lastActivityMs + StaticSettings.DURATION_IDLE_TIMEOUT_MS;
    const accrueTo = Math.min(t, activeUntil);
    if (accrueTo > this._lastAccruedMs) {
      const delta = accrueTo - this._lastAccruedMs;
      s.totalDurationMs += delta;
      this._activeElapsedMs += delta;
      this._lastAccruedMs = accrueTo;
      // Decayed duration: decay what's there to this chunk's (active-time) end,
      // then add the fresh Δ ms. The chunk is treated as occurring at its end —
      // a negligible over-fresh approximation vs. the 14-min half-life.
      const a = this._activeElapsedMs;
      s.decayDur =
        s.decayDur * StatsAccumulator.decayFactor(a - s.decayDurActiveMs) +
        delta;
      s.decayDurActiveMs = a;
    }
  }

  private closeVisit(t: number): void {
    if (!this._focusKey) return;
    const s = this._stats.get(this._focusKey);
    if (!s) return;
    this.flush(t);
    const visitMs = Math.max(0, t - this._focusStart);
    if (visitMs >= StaticSettings.MIN_QUALIFYING_ACCESS_MS) {
      s.accessCount += 1;
      // Decayed frequency: decay the running count to now (the visit's active-
      // time end), then add this one access. Because the position is advanced
      // per access, an access an hour ago contributes far less than a fresh one.
      const a = this._activeElapsedMs;
      s.decayFreq =
        s.decayFreq * StatsAccumulator.decayFactor(a - s.decayFreqActiveMs) + 1;
      s.decayFreqActiveMs = a;
    }
    if (visitMs >= StaticSettings.MIN_RECENCY_ACCESS_MS) {
      s.lastAccessMs = Math.max(s.lastAccessMs, this._lastActivityMs);
      s.lastAccessActiveMs = Math.max(
        s.lastAccessActiveMs,
        this._lastActivityActiveMs
      );
    }
  }
}
