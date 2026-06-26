/*
 * SessionTimeline
 * ---------------
 * The raw, chronological event log recorded while a task is active. Replaying it
 * over a time window reconstructs exactly the per-artefact usage stats for that
 * window, which is what powers the end-of-task "trim the timeline" curation: the
 * user moves the start/end brackets and we re-score as if only the kept window
 * happened.
 */

import { ArtifactKind } from '../entity/ArtifactUsage';
import StatsAccumulator, { UsageStat } from './StatsAccumulator';

export type TLEvent =
  | { ty: 'f'; t: number; key: string; kind: ArtifactKind } // focus switched to key
  | { ty: 'i'; t: number } // interaction (click / keystroke)
  | { ty: 'a'; t: number }; // passive activity (mouse-move / scroll)

/**
 * Replay the events clamped to [winStart, winEnd] and return the per-artefact
 * stats contributed within that window. Events are assumed chronological.
 */
export function replay(
  events: TLEvent[],
  winStart: number,
  winEnd: number
): Map<string, UsageStat> {
  const acc = new StatsAccumulator();
  if (winEnd <= winStart) return acc.snapshot();

  // Focus state at winStart = the last 'f' event at or before winStart.
  let initialFocus: { key: string; kind: ArtifactKind } | null = null;
  for (const ev of events) {
    if (ev.t > winStart) break;
    if (ev.ty === 'f') initialFocus = { key: ev.key, kind: ev.kind };
  }
  if (initialFocus) acc.focus(initialFocus.key, initialFocus.kind, winStart);

  for (const ev of events) {
    if (ev.t <= winStart) continue;
    if (ev.t > winEnd) break;
    if (ev.ty === 'f') acc.focus(ev.key, ev.kind, ev.t);
    else if (ev.ty === 'i') acc.interaction(ev.t);
    else acc.activity(ev.t);
  }
  acc.end(winEnd);
  return acc.snapshot();
}

/**
 * Merge previously-accumulated stats (from earlier sessions of the task) with
 * this session's windowed contribution. Durations/counts add; recency takes the
 * most recent.
 */
export function mergeStats(
  prior: Map<string, UsageStat>,
  contribution: Map<string, UsageStat>
): Map<string, UsageStat> {
  const out = new Map<string, UsageStat>();
  for (const [k, v] of prior) out.set(k, { ...v });
  for (const [k, c] of contribution) {
    const p = out.get(k);
    if (!p) {
      out.set(k, { ...c });
    } else {
      out.set(k, {
        kind: c.kind || p.kind,
        totalDurationMs: p.totalDurationMs + c.totalDurationMs,
        accessCount: p.accessCount + c.accessCount,
        interactionCount: p.interactionCount + c.interactionCount,
        lastAccessMs: Math.max(p.lastAccessMs, c.lastAccessMs),
      });
    }
  }
  return out;
}
