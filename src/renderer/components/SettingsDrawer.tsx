import { useEffect, useRef } from 'react';
import Settings from '../pages/Settings';
import styles from './SettingsDrawer.module.scss';

type Props = {
  open: boolean;
  onClose: () => void;
};

/**
 * Slide-in settings panel anchored to the right edge of the main window.
 * Reuses the existing `Settings` page so the underlying logic stays in
 * one place. The Settings panel is mounted lazily on first open and then
 * kept around so reopening is instant.
 */
export default function SettingsDrawer({ open, onClose }: Props) {
  const everOpened = useRef(false);
  if (open) everOpened.current = true;

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <>
      <div
        className={`${styles.backdrop} ${open ? styles.backdropOpen : ''}`}
        onClick={onClose}
        aria-hidden={!open}
      />
      <aside
        className={`${styles.drawer} ${open ? styles.drawerOpen : ''}`}
        role="dialog"
        aria-label="Settings"
        aria-hidden={!open}
      >
        <div className={styles.header}>
          <h2 className={styles.title}>Settings</h2>
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label="Close settings"
          >
            ×
          </button>
        </div>
        <div className={styles.content}>
          {everOpened.current && <Settings />}
        </div>
      </aside>
    </>
  );
}
