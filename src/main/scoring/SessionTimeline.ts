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

export type TimelineMarker = { t: number; key: string; kind: ArtifactKind };
export type IdlePeriod = { start: number; end: number };
/** A stretch during which one artefact was the focused/active one. */
export type TimelineSegment = {
  start: number;
  end: number;
  key: string;
  kind: ArtifactKind;
};
export type TimelineAnalysis = {
  markers: TimelineMarker[];
  segments: TimelineSegment[];
  idlePeriods: IdlePeriod[];
};

/**
 * Describe the session for the trim bar's backdrop: when each artefact was first
 * focused, and the stretches of inactivity during which duration scoring freezes
 * (no activity for longer than the idle timeout — see StatsAccumulator).
 *
 * Every event (focus/interaction/activity) counts as activity, mirroring the
 * accumulator: a focus switch resets the idle clock just like a click does.
 */
export function analyzeTimeline(
  events: TLEvent[],
  winStart: number,
  winEnd: number,
  idleTimeoutMs: number
): TimelineAnalysis {
  const markers: TimelineMarker[] = [];
  const seen = new Set<string>();
  for (const ev of events) {
    if (ev.ty !== 'f') continue;
    if (ev.t < winStart || ev.t > winEnd) continue;
    if (seen.has(ev.key)) continue;
    seen.add(ev.key);
    markers.push({ t: ev.t, key: ev.key, kind: ev.kind });
  }

  // Active segments: which artefact was focused over each stretch. The focus at
  // winStart is the last 'f' at or before it; every later 'f' in the window ends
  // the current segment and starts a new one; the last runs to winEnd.
  const segments: TimelineSegment[] = [];
  let cur: { key: string; kind: ArtifactKind } | null = null;
  for (const ev of events) {
    if (ev.ty !== 'f' || ev.t > winStart) break;
    cur = { key: ev.key, kind: ev.kind };
  }
  let segStart = winStart;
  for (const ev of events) {
    if (ev.ty !== 'f') continue;
    if (ev.t <= winStart || ev.t > winEnd) continue;
    if (cur && ev.t > segStart) {
      segments.push({ start: segStart, end: ev.t, key: cur.key, kind: cur.kind });
    }
    cur = { key: ev.key, kind: ev.kind };
    segStart = ev.t;
  }
  if (cur && winEnd > segStart) {
    segments.push({ start: segStart, end: winEnd, key: cur.key, kind: cur.kind });
  }

  // Idle = any gap between consecutive activity timestamps longer than the idle
  // timeout. The frozen stretch is [lastActivity + idleTimeout, nextActivity].
  const times = events
    .filter((e) => e.t >= winStart && e.t <= winEnd)
    .map((e) => e.t);
  const stamps = [winStart, ...times, winEnd].sort((a, b) => a - b);
  const idlePeriods: IdlePeriod[] = [];
  for (let i = 1; i < stamps.length; i += 1) {
    const prev = stamps[i - 1];
    const cur = stamps[i];
    const idleStart = prev + idleTimeoutMs;
    if (cur > idleStart) idlePeriods.push({ start: idleStart, end: cur });
  }
  return { markers, segments, idlePeriods };
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
  // The task's cumulative active time before this session = sum of prior
  // durations (the active clock equals the sum of all durations). Prior recency
  // offsets are already on this cumulative clock; the contribution's offsets are
  // session-relative (start at 0), so we shift them up by this amount to land on
  // the same continuous, idle-aware clock. Gaps between sessions add nothing.
  let priorActiveMs = 0;
  for (const [k, v] of prior) {
    out.set(k, { ...v });
    priorActiveMs += v.totalDurationMs;
  }
  for (const [k, c] of contribution) {
    const cActive = c.lastAccessActiveMs + priorActiveMs;
    const p = out.get(k);
    if (!p) {
      out.set(k, { ...c, lastAccessActiveMs: cActive });
    } else {
      out.set(k, {
        kind: c.kind || p.kind,
        totalDurationMs: p.totalDurationMs + c.totalDurationMs,
        accessCount: p.accessCount + c.accessCount,
        interactionCount: p.interactionCount + c.interactionCount,
        lastAccessMs: Math.max(p.lastAccessMs, c.lastAccessMs),
        lastAccessActiveMs: Math.max(p.lastAccessActiveMs, cActive),
      });
    }
  }
  return out;
}
