/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, April 2023
 */

import { useState } from 'react';
import EditIcon from '../Icons/EditIcon';
import styles from './GalleryEntry.module.scss';
import SnapshotEntity from 'main/entity/Snapshot';
import TrashIcon from '../Icons/TrashIcon';
import PlayIcon from '../Icons/PlayIcon';
import { toast } from 'react-toastify';
import SnapshotPreview from './SnapshotPreview';

type Props = {
  snapshot: SnapshotEntity;
  onDelete: () => void;
};

export default function GalleryEntry(props: Props) {
  const [isHovering, setIsHovering] = useState<boolean>(false);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  const onClickSnapshot = async (e: React.MouseEvent) => {
    // needed just for logging. Just log when it is expanded.
    if (!isExpanded) {
      await window.electron.ipcRenderer.invoke(
        'expand-snapshot-preview',
        props.snapshot.id
      );
    }

    setIsExpanded(!isExpanded);
  };

  const onClickEdit = async () => {
    await window.electron.ipcRenderer.invoke(
      'open-snapshot',
      props.snapshot.id
    );
  };

  const onClickDelete = async () => {
    if (
      confirm(
        `Are you sure that you want to delete "${props.snapshot.name}"?`
      ) === true
    ) {
      try {
        toast.promise(
          async () =>
            await window.electron.ipcRenderer.invoke(
              'gallery-delete-snapshot',
              props.snapshot.id
            ),
          {
            pending: 'Deleting Snapshot...',
            success: 'Snapshot Deleted',
            error: 'Something went wrong',
          }
        );
        props.onDelete();
      } catch (err) {
        console.error(err);
      }
    }
  };

  const onClickRestore = async () => {
    await window.electron.ipcRenderer.invoke(
      'restore-snapshot',
      props.snapshot.id
    );
  };

  return (
    <div
      className={styles.singleSnapshot}
      onMouseEnter={() => {
        setIsHovering(true);
      }}
      onMouseLeave={() => {
        setIsHovering(false);
      }}
    >
      <div
        className={styles.snapshotPreviewContainer}
        onClick={onClickSnapshot}
      >
        <SnapshotPreview snapshot={props.snapshot} isExpanded={isExpanded} />
      </div>
      {isHovering ? (
        <div className={styles.buttonBox}>
          <div
            className={`${styles.dot} ${styles.edit}`}
            onClick={() => {
              onClickEdit();
            }}
          >
            <EditIcon className={styles.icon} />
          </div>
          <div
            className={`${styles.dot} ${styles.delete}`}
            onClick={() => {
              onClickDelete();
            }}
          >
            <TrashIcon className={styles.icon} />
          </div>
          <div
            className={`${styles.dot} ${styles.restore}`}
            onClick={() => onClickRestore()}
          >
            <PlayIcon className={styles.icon} />
            <span>Restore</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
