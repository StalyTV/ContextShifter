/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, April 2023
 */

import { useState } from 'react';
import EditIcon from './Icons/EditIcon';
import styles from './SnapshotPreview.module.scss';
import SnapshotEntity from 'main/entity/Snapshot';

type Props = {
  snapshot: SnapshotEntity;
};

export default function SnapshotPreview(props: Props) {
  const [isHovering, setIsHovering] = useState<boolean>(false);

  const getFormattedDate = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString([], {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const onClickSnapshot = async (snapshotId: number) => {
    await window.electron.ipcRenderer.invoke('open-snapshot', snapshotId);
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
      <div className={styles.snapshotPreviewContainer}>
        <div>{props.snapshot.name}</div>
        <div>{getFormattedDate(props.snapshot.created)}</div>
      </div>
      {isHovering ? (
        <div
          className={styles.dot}
          onClick={() => {
            onClickSnapshot(props.snapshot.id);
          }}
        >
          <EditIcon className={styles.icon} />
        </div>
      ) : null}
    </div>
  );
}
