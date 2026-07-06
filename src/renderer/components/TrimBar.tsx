import { useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  TimelineMarkerDTO,
  TimelineSegmentDTO,
  IdlePeriodDTO,
} from '../../types/Commands';
import { byPrefixAndName } from '../fontawesome';
import dominantColor from './dominantColor';
import styles from './TrimBar.module.scss';

type Props = {
  startMs: number;
  endMs: number;
  trimStart: number;
  trimEnd: number;
  /** Artefact-introduction markers (thin ticks, tinted by icon colour). */
  markers?: TimelineMarkerDTO[];
  /** Active stretches per artefact (coloured bands, tinted by icon colour). */
  segments?: TimelineSegmentDTO[];
  /** Idle stretches where duration scoring was frozen (greyed bands). */
  idlePeriods?: IdlePeriodDTO[];
  /** When the task was set active — drawn as a "task started" indicator. */
  activeStartMs?: number;
  /** Where the previous task ended — drawn as a boundary indicator (0 = none). */
  lastTaskEndMs?: number;
  /** Reveal 15 more minutes of pre-roll (shown as a button when available). */
  onExtendEarlier?: () => void;
  canExtend?: boolean;
  /** Live while dragging (visual only). */
  onPreview: (start: number, end: number) => void;
  /** On release — recompute the scores for the kept window. */
  onCommit: (start: number, end: number) => void;
  busy?: boolean;
};

function fmtClock(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

function fmtDur(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  }
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

const MIN_WINDOW_MS = 1000;
const FALLBACK_COLOR = '#8a8a8a';

/**
 * A video-editor-style trim bar: drag the bracket handles to keep only part of
 * the session. Reports the window live (onPreview) and on release (onCommit).
 * The backdrop shows which artefact was active over each stretch (coloured
 * bands, tinted by the artefact's icon colour), idle stretches where duration
 * scoring froze (greyed bands), and where each artefact was first introduced
 * (thin ticks).
 */
export default function TrimBar({
  startMs,
  endMs,
  trimStart,
  trimEnd,
  markers,
  segments,
  idlePeriods,
  activeStartMs,
  lastTaskEndMs,
  onExtendEarlier,
  canExtend,
  onPreview,
  onCommit,
  busy,
}: Props) {
  const barRef = useRef<HTMLDivElement>(null);
  const total = Math.max(1, endMs - startMs);
  const dragging = useRef<null | 'start' | 'end'>(null);
  // Latest previewed window, so the mouseup handler commits the final value.
  const latest = useRef({ start: trimStart, end: trimEnd });
  // Resolved dominant colour per artefact key (async via the icon image).
  const [colors, setColors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!dragging.current) latest.current = { start: trimStart, end: trimEnd };
  }, [trimStart, trimEnd]);

  // Resolve a colour for every artefact key on the timeline (markers + segments).
  useEffect(() => {
    let cancelled = false;
    const byKey = new Map<string, string>();
    (segments ?? []).forEach((s) => byKey.set(s.key, s.icon));
    (markers ?? []).forEach((m) => {
      if (!byKey.has(m.key)) byKey.set(m.key, m.icon);
    });
    byKey.forEach((icon, key) => {
      dominantColor(icon)
        .then((c) => {
          if (!cancelled) {
            setColors((prev) => (prev[key] === c ? prev : { ...prev, [key]: c }));
          }
          return c;
        })
        .catch(() => undefined);
    });
    return () => {
      cancelled = true;
    };
  }, [markers, segments]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const which = dragging.current;
      if (!which || !barRef.current) return;
      const rect = barRef.current.getBoundingClientRect();
      const ratio = Math.min(
        1,
        Math.max(0, (e.clientX - rect.left) / rect.width)
      );
      const ms = startMs + ratio * total;
      let s = latest.current.start;
      let en = latest.current.end;
      if (which === 'start') s = Math.min(ms, en - MIN_WINDOW_MS);
      else en = Math.max(ms, s + MIN_WINDOW_MS);
      s = Math.max(startMs, s);
      en = Math.min(endMs, en);
      latest.current = { start: s, end: en };
      onPreview(s, en);
    };
    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = null;
      onCommit(latest.current.start, latest.current.end);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [startMs, endMs, total, onPreview, onCommit]);

  const pct = (t: number) => ((t - startMs) / total) * 100;
  const leftPct = pct(trimStart);
  const rightPct = pct(trimEnd);
  const trimmed = trimStart > startMs + 500 || trimEnd < endMs - 500;

  return (
    <div className={styles.wrap}>
      <div className={styles.heading}>
        <span className={styles.headingLeft}>
          {canExtend && onExtendEarlier && (
            <button
              type="button"
              className={styles.extendButton}
              onClick={onExtendEarlier}
              title="Reveal 15 more minutes before the task started"
            >
              <FontAwesomeIcon icon={byPrefixAndName.fas.backward} /> 15m
            </button>
          )}
          <span>Trim session timeline</span>
        </span>
        <span className={styles.kept}>
          kept {fmtDur(trimEnd - trimStart)}
          {trimmed ? ` · trimmed ${fmtDur(total - (trimEnd - trimStart))}` : ''}
          {busy ? ' · re-scoring…' : ''}
        </span>
      </div>
      <div ref={barRef} className={styles.bar}>
        <div className={styles.trackDim} />

        {/* Active segments: which artefact was focused over each stretch. */}
        {(segments ?? []).map((s, i) => {
          const l = Math.max(0, pct(s.startMs));
          const r = Math.min(100, pct(s.endMs));
          if (r <= l) return null;
          const color = colors[s.key] ?? FALLBACK_COLOR;
          return (
            <div
              // eslint-disable-next-line react/no-array-index-key
              key={`seg-${i}`}
              className={styles.segment}
              style={{ left: `${l}%`, width: `${r - l}%`, background: color }}
              title={`${s.label} · ${fmtClock(s.startMs)}–${fmtClock(s.endMs)}`}
            />
          );
        })}

        {/* Idle (frozen-scoring) bands — drawn over the segments. */}
        {(idlePeriods ?? []).map((p, i) => {
          const l = Math.max(0, pct(p.start));
          const r = Math.min(100, pct(p.end));
          if (r <= l) return null;
          return (
            <div
              // eslint-disable-next-line react/no-array-index-key
              key={`idle-${i}`}
              className={styles.idleBand}
              style={{ left: `${l}%`, width: `${r - l}%` }}
              title={`Inactive ${fmtDur(p.end - p.start)} — scoring frozen`}
            />
          );
        })}

        {/* Dim the trimmed-away portions so the kept window stands out. */}
        {leftPct > 0 && (
          <div
            className={styles.trimmedOverlay}
            style={{ left: 0, width: `${leftPct}%` }}
          />
        )}
        {rightPct < 100 && (
          <div
            className={styles.trimmedOverlay}
            style={{ left: `${rightPct}%`, width: `${100 - rightPct}%` }}
          />
        )}

        {/* Where the previous task ended — you can't include time before it. */}
        {lastTaskEndMs != null &&
          lastTaskEndMs > startMs &&
          lastTaskEndMs < endMs && (
            <div
              className={styles.boundaryLine}
              style={{ left: `${pct(lastTaskEndMs)}%` }}
              title={`Previous task ended ${fmtClock(lastTaskEndMs)}`}
            />
          )}

        {/* When the task was set active (everything left of it is pre-roll). */}
        {activeStartMs != null &&
          activeStartMs > startMs &&
          activeStartMs < endMs && (
            <div
              className={styles.activeLine}
              style={{ left: `${pct(activeStartMs)}%` }}
              title={`Task started ${fmtClock(activeStartMs)}`}
            />
          )}

        {/* Kept-window outline (no fill, so segment colours show through). */}
        <div
          className={styles.keptRegion}
          style={{ left: `${leftPct}%`, right: `${100 - rightPct}%` }}
        />

        {/* Artefact-introduction ticks. */}
        {(markers ?? []).map((m) => {
          const within = m.t >= trimStart && m.t <= trimEnd;
          const color = colors[m.key] ?? FALLBACK_COLOR;
          return (
            <div
              key={`mark-${m.key}-${m.t}`}
              className={`${styles.marker} ${within ? '' : styles.markerOut}`}
              style={{ left: `${pct(m.t)}%`, background: color }}
              title={`${m.label} · first seen ${fmtClock(m.t)}`}
            />
          );
        })}

        <div
          className={`${styles.handle} ${styles.handleStart}`}
          style={{ left: `${leftPct}%` }}
          onMouseDown={(e) => {
            e.preventDefault();
            dragging.current = 'start';
          }}
          title="Drag to trim the start"
        >
          <span className={styles.bracket}>[</span>
        </div>
        <div
          className={`${styles.handle} ${styles.handleEnd}`}
          style={{ left: `${rightPct}%` }}
          onMouseDown={(e) => {
            e.preventDefault();
            dragging.current = 'end';
          }}
          title="Drag to trim the end"
        >
          <span className={styles.bracket}>]</span>
        </div>
      </div>
      <div className={styles.times}>
        <span>{fmtClock(trimStart)}</span>
        <span>{fmtClock(trimEnd)}</span>
      </div>
    </div>
  );
}
