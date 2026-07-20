import { useState } from 'react';
import styles from './NewTaskDialog.module.scss';

export type InSituResponse = {
  matchRating: number | null;
  comment: string;
  resumeFeeling: 'easier' | 'same' | 'harder' | null;
  skipped: boolean;
};

type Props = {
  taskName: string;
  onDone: (resp: InSituResponse) => void;
};

const FEELINGS: { value: 'easier' | 'same' | 'harder'; label: string }[] = [
  { value: 'easier', label: 'Easier than usual' },
  { value: 'same', label: 'About the same' },
  { value: 'harder', label: 'Harder' },
];

/**
 * Phase-2 in-situ micro-survey shown the moment a task's artefacts are saved.
 * One rating + an optional comment + a quick "how did resuming feel" choice,
 * with a Skip so a rushed participant is never blocked.
 */
export default function InSituSurvey({ taskName, onDone }: Props) {
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [feeling, setFeeling] = useState<'easier' | 'same' | 'harder' | null>(
    null
  );

  const pill = (active: boolean): React.CSSProperties => ({
    padding: '6px 12px',
    borderRadius: 6,
    cursor: 'pointer',
    border: active
      ? '1px solid var(--accent)'
      : '1px solid rgba(128,128,128,0.4)',
    background: active
      ? 'color-mix(in srgb, var(--accent) 12%, transparent)'
      : 'transparent',
    color: 'inherit',
    fontWeight: active ? 600 : 400,
    minWidth: 34,
  });

  return (
    <div className={styles.backdrop}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        style={{ maxWidth: 460 }}
      >
        <div className={styles.header}>
          <h2 className={styles.title}>Quick check</h2>
        </div>

        <div style={{ padding: '4px 4px 8px', display: 'grid', gap: 18 }}>
          <div>
            <div style={{ marginBottom: 8 }}>
              When you switched to <strong>&ldquo;{taskName}&rdquo;</strong> —
              how well did the artefacts match what you needed to get back in?
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  style={{ ...pill(rating === n), flex: 1, textAlign: 'center' }}
                  onClick={() => setRating(n)}
                >
                  {n}
                </button>
              ))}
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 11,
                opacity: 0.7,
                marginTop: 4,
              }}
            >
              <span>Missed a lot (1)</span>
              <span>Spot on (5)</span>
            </div>
          </div>

          <div>
            <div style={{ marginBottom: 6 }}>
              Anything missing, or there that shouldn&rsquo;t be?{' '}
              <span style={{ opacity: 0.6 }}>(optional)</span>
            </div>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              style={{
                width: '100%',
                resize: 'vertical',
                padding: '6px 8px',
                borderRadius: 6,
                border: '1px solid rgba(128,128,128,0.4)',
                background: 'transparent',
                color: 'inherit',
                font: 'inherit',
              }}
            />
          </div>

          <div>
            <div style={{ marginBottom: 8 }}>
              Getting back into the task felt…
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {FEELINGS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  style={pill(feeling === f.value)}
                  onClick={() => setFeeling(f.value)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className={styles.footer}>
          <button
            type="button"
            className={styles.secondary}
            onClick={() =>
              onDone({
                matchRating: null,
                comment: '',
                resumeFeeling: null,
                skipped: true,
              })
            }
          >
            Skip
          </button>
          <button
            type="button"
            className={styles.primary}
            onClick={() =>
              onDone({
                matchRating: rating,
                comment: comment.trim(),
                resumeFeeling: feeling,
                skipped: false,
              })
            }
          >
            Submit
          </button>
        </div>
      </div>
    </div>
  );
}
