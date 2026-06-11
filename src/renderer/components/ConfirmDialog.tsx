import styles from './NewTaskDialog.module.scss';

type Props = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Renders the confirm button in a destructive (red) style. */
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Minimal confirmation modal. Reuses the shared dialog styles. Used e.g. to
 * confirm task deletion.
 */
export default function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <div
      className={styles.backdrop}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className={styles.dialog} role="dialog" aria-modal="true">
        <div className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <button
            type="button"
            className={styles.close}
            onClick={onCancel}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className={styles.muted} style={{ padding: '4px 0 8px', textAlign: 'left' }}>
          {message}
        </div>

        <div className={styles.footer}>
          <button type="button" className={styles.secondary} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={styles.primary}
            style={danger ? { background: '#dc2626' } : undefined}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
