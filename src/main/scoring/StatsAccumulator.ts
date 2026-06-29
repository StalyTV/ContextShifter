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
      });
    }
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
