import { useState } from 'react';
import styles from './NewTaskDialog.module.scss';

type Props = {
  onClose: () => void;
  onStarted: () => void;
  /** When set, the task is created as a subtask under this parent. */
  parentId?: number | null;
  /** Optional name shown in the header next to "under". */
  parentName?: string | null;
};

/**
 * Small dialog that just collects a task name and starts the task. Artefact
 * selection is deferred to the CommitTaskDialog that opens when the user
 * stops or switches tasks.
 */
export default function StartTaskDialog({
  onClose,
  onStarted,
  parentId = null,
  parentName = null,
}: Props) {
  const isSubtask = parentId !== null;
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStart = async (declutter = false) => {
    if (saving) return;
    setSaving(true);
    try {
      await window.electron.ipcRenderer.invoke(
        'start-task',
        name,
        parentId,
        declutter
      );
      onStarted();
    } catch (err) {
      setError(String(err));
      setSaving(false);
    }
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
          <h2 className={styles.title}>
            {isSubtask
              ? `Start new subtask${parentName ? ` — under ${parentName}` : ''}`
              : 'Start new task'}
          </h2>
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <label className={styles.field}>
          <span className={styles.label}>Name</span>
          <input
            className={styles.input}
            type="text"
            placeholder={isSubtask ? 'Subtask name' : 'Task name'}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleStart(false);
            }}
            autoFocus
          />
        </label>

        <div className={styles.muted} style={{ marginTop: 6 }}>
          Tracking starts immediately. You can pick which applications, tabs,
          and files to associate with this task when you stop or switch to
          another task.
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.footer}>
          <button
            type="button"
            className={styles.secondary}
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            className={styles.primary}
            onClick={() => handleStart(false)}
            disabled={saving || name.trim().length === 0}
          >
            {saving ? 'Starting...' : 'Start task'}
          </button>
          <button
            type="button"
            className={styles.declutter}
            onClick={() => handleStart(true)}
            disabled={saving || name.trim().length === 0}
            title="Start the task and close everything currently open (except never-close apps and tabs)"
          >
            {saving ? 'Starting...' : 'Declutter and start task'}
          </button>
        </div>
      </div>
    </div>
  );
}
