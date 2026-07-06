import { useEffect, useState } from 'react';
import styles from './NewTaskDialog.module.scss';
import { ScoreWeightsDTO } from 'types/Commands';

type Props = {
  onClose: () => void;
};

const FIELDS: Array<{
  key: keyof ScoreWeightsDTO;
  label: string;
  hint: string;
}> = [
  { key: 'duration', label: 'Duration — w1', hint: 'normalized foreground time' },
  { key: 'frequency', label: 'Frequency — w2', hint: 'log(1 + access count)' },
  { key: 'recency', label: 'Recency — w3', hint: 'exponential recency decay' },
  {
    key: 'interaction',
    label: 'Interaction — w4',
    hint: 'share of clicks + keystrokes',
  },
  { key: 'lambda', label: 'Lambda — λ', hint: 'recency decay rate per minute' },
  {
    key: 'semantic',
    label: 'Semantic — α',
    hint: '0..1, multiplies score by content relevance (0 = off)',
  },
];

/**
 * Edit the artefact-scoring weights (w1..w4 + lambda). Changing them re-scores
 * every task, so applying requires two explicit confirmations.
 */
export default function WeightsDialog({ onClose }: Props) {
  const [weights, setWeights] = useState<ScoreWeightsDTO | null>(null);
  // 0 = editing, 1 = first confirmation, 2 = final confirmation
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const w = await window.electron.ipcRenderer.invoke('get-score-weights');
        if (!cancelled) setWeights(w);
      } catch (err) {
        if (!cancelled) setError(String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setField = (key: keyof ScoreWeightsDTO, raw: string) => {
    const n = parseFloat(raw);
    setWeights((prev) =>
      prev ? { ...prev, [key]: Number.isFinite(n) ? n : 0 } : prev
    );
    setStep(0); // editing invalidates any in-progress confirmation
    setDone(null);
  };

  const apply = async () => {
    if (!weights || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await window.electron.ipcRenderer.invoke(
        'set-score-weights',
        weights
      );
      setDone(`Saved. Re-scored ${res.rescoredTasks} task(s).`);
      setStep(0);
    } catch (err) {
      setError(String(err));
    }
    setSaving(false);
  };

  return (
    <div
      className={styles.backdrop}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.dialog} role="dialog" aria-modal="true">
        <div className={styles.header}>
          <h2 className={styles.title}>Scoring weights</h2>
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {weights === null ? (
          <div className={styles.muted}>Loading…</div>
        ) : (
          <>
            {FIELDS.map((f) => (
              <label key={f.key} className={styles.field}>
                <span className={styles.label}>
                  {f.label}{' '}
                  <span className={styles.muted} style={{ fontSize: '0.7rem' }}>
                    ({f.hint})
                  </span>
                </span>
                <input
                  className={styles.input}
                  type="number"
                  step="0.01"
                  min="0"
                  value={String(weights[f.key])}
                  onChange={(e) => setField(f.key, e.target.value)}
                  disabled={saving}
                />
              </label>
            ))}

            {step === 1 && (
              <div className={styles.error} style={{ marginTop: 10 }}>
                Changing the weights re-scores <strong>every</strong> task. Continue?
              </div>
            )}
            {step === 2 && (
              <div className={styles.error} style={{ marginTop: 10 }}>
                Final confirmation — this overwrites all stored task scores and
                cannot be undone.
              </div>
            )}
            {done && (
              <div className={styles.muted} style={{ marginTop: 10 }}>
                {done}
              </div>
            )}
            {error && <div className={styles.error}>{error}</div>}

            <div className={styles.footer}>
              {step === 0 && (
                <>
                  <button
                    type="button"
                    className={styles.secondary}
                    onClick={onClose}
                    disabled={saving}
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    className={styles.primary}
                    onClick={() => {
                      setDone(null);
                      setStep(1);
                    }}
                    disabled={saving}
                  >
                    Save weights…
                  </button>
                </>
              )}
              {step === 1 && (
                <>
                  <button
                    type="button"
                    className={styles.secondary}
                    onClick={() => setStep(0)}
                    disabled={saving}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className={styles.primary}
                    onClick={() => setStep(2)}
                    disabled={saving}
                  >
                    Yes, continue
                  </button>
                </>
              )}
              {step === 2 && (
                <>
                  <button
                    type="button"
                    className={styles.secondary}
                    onClick={() => setStep(0)}
                    disabled={saving}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className={styles.primary}
                    onClick={apply}
                    disabled={saving}
                  >
                    {saving ? 'Applying…' : 'Apply new weights'}
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
