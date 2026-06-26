import { useEffect, useRef } from 'react';
import styles from './TrimBar.module.scss';

type Props = {
  startMs: number;
  endMs: number;
  trimStart: number;
  trimEnd: number;
  /** Live while dragging (visual only). */
  onPreview: (start: number, end: number) => void;
  /** On release — recompute the scores for the kept window. */
  onCommit: (start: number, end: number) => void;
  busy?: boolean;
};

function fmtClock(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
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

/**
 * A video-editor-style trim bar: drag the bracket handles to keep only part of
 * the session. Reports the window live (onPreview) and on release (onCommit).
 */
export default function TrimBar({
  startMs,
  endMs,
  trimStart,
  trimEnd,
  onPreview,
  onCommit,
  busy,
}: Props) {
  const barRef = useRef<HTMLDivElement>(null);
  const total = Math.max(1, endMs - startMs);
  const dragging = useRef<null | 'start' | 'end'>(null);
  // Latest previewed window, so the mouseup handler commits the final value.
  const latest = useRef({ start: trimStart, end: trimEnd });

  useEffect(() => {
    if (!dragging.current) latest.current = { start: trimStart, end: trimEnd };
  }, [trimStart, trimEnd]);

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

  const leftPct = ((trimStart - startMs) / total) * 100;
  const rightPct = ((trimEnd - startMs) / total) * 100;
  const trimmed = trimStart > startMs + 500 || trimEnd < endMs - 500;

  return (
    <div className={styles.wrap}>
      <div className={styles.heading}>
        <span>Trim session timeline</span>
        <span className={styles.kept}>
          kept {fmtDur(trimEnd - trimStart)}
          {trimmed ? ` · trimmed ${fmtDur(total - (trimEnd - trimStart))}` : ''}
          {busy ? ' · re-scoring…' : ''}
        </span>
      </div>
      <div ref={barRef} className={styles.bar}>
        <div className={styles.trackDim} />
        <div
          className={styles.keptRegion}
          style={{ left: `${leftPct}%`, right: `${100 - rightPct}%` }}
        />
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
