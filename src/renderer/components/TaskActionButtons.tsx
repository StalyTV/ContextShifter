import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { byPrefixAndName } from '../fontawesome';
import styles from './TaskActionButtons.module.scss';

type Props = {
  onActivate: () => void;
  onDelete: () => void;
  /** When true, the task is already the active one (Activate is disabled). */
  isActive?: boolean;
  className?: string;
};

/**
 * The Activate (circle-play) + Delete (trash-can) icon buttons shown next to a
 * task in the list / detail / subtask views. Click handlers stop propagation so
 * they don't trigger the surrounding row's navigation/activation.
 */
export default function TaskActionButtons({
  onActivate,
  onDelete,
  isActive = false,
  className,
}: Props) {
  return (
    <div className={`${styles.actions} ${className ?? ''}`}>
      <button
        type="button"
        className={`${styles.actionBtn} ${styles.activate} ${
          isActive ? styles.activeNow : ''
        }`}
        title={isActive ? 'Already active' : 'Activate task'}
        aria-label="Activate task"
        disabled={isActive}
        onClick={(e) => {
          e.stopPropagation();
          onActivate();
        }}
      >
        <FontAwesomeIcon icon={byPrefixAndName.fas['circle-play']} />
      </button>
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
