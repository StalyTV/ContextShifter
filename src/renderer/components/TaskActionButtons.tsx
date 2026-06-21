import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { byPrefixAndName } from '../fontawesome';
import styles from './TaskActionButtons.module.scss';

type Props = {
  /** Activate (make active) — shown as a play button when not active. */
  onActivate: () => void;
  /** Stop (deactivate) — shown as a pause button when active. */
  onStop: () => void;
  onDelete: () => void;
  /** When true, the task is the active one (shows pause instead of play). */
  isActive?: boolean;
  className?: string;
};

/**
 * Activate/Pause + Delete icon buttons next to a task in the list / detail /
 * subtask views. The primary button toggles: play (activate) when inactive,
 * pause (stop) when active. Click handlers stop propagation so they don't
 * trigger the surrounding row's navigation.
 */
export default function TaskActionButtons({
  onActivate,
  onStop,
  onDelete,
  isActive = false,
  className,
}: Props) {
  return (
    <div className={`${styles.actions} ${className ?? ''}`}>
      {isActive ? (
        <button
          type="button"
          className={`${styles.actionBtn} ${styles.activate} ${styles.activeNow}`}
          title="Stop (deactivate) task"
          aria-label="Stop task"
          onClick={(e) => {
            e.stopPropagation();
            onStop();
          }}
        >
          <FontAwesomeIcon icon={byPrefixAndName.far['circle-pause']} />
        </button>
      ) : (
        <button
          type="button"
          className={`${styles.actionBtn} ${styles.activate}`}
          title="Activate task"
          aria-label="Activate task"
          onClick={(e) => {
            e.stopPropagation();
            onActivate();
          }}
        >
          <FontAwesomeIcon icon={byPrefixAndName.fas['circle-play']} />
        </button>
      )}
      <button
        type="button"
        className={`${styles.actionBtn} ${styles.delete}`}
        title="Delete task"
        aria-label="Delete task"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
      >
        <FontAwesomeIcon icon={byPrefixAndName.far['trash-can']} />
      </button>
    </div>
  );
}
