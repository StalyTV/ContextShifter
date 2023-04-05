/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, April 2023
 */

import styles from './SnapshotPreview.module.scss';
import SnapshotEntity from 'main/entity/Snapshot';

type Props = {
  snapshot: SnapshotEntity;
};

export default function SnapshotPreview(props: Props) {
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

  return (
    <div className={styles.snapshotPreviewContainer}>
      <div>{props.snapshot.name}</div>
      <div>{getFormattedDate(props.snapshot.created)}</div>
    </div>
  );
}
