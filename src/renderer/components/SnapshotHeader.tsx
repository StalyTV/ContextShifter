/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, April 2023
 */

import CameraIcon from './Icons/CameraIcon';
import EditIcon from './Icons/EditIcon';
import Input from './Input';
import styles from './SnapshotHeader.module.scss';

type Props = {
  snapshotName: string;
  createTimestamp: string;
  editTimestamp: string;
  onNameChange: (e: React.ChangeEvent<HTMLInputElement>) => {};
  showTimestamp: boolean;
};

export default function SnapshotHeader(props: Props) {
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
    <div className={styles.header}>
      <div className={styles.titleContainer}>
        <Input value={props.snapshotName} onChange={props.onNameChange} />
      </div>
      {props.showTimestamp ? (
        <div className={styles.timestamps}>
          <div className={styles.timestamp}>
            <CameraIcon className={styles.icon} />
            {getFormattedDate(props.createTimestamp)}
          </div>
          {props.editTimestamp ? (
            <div className={styles.timestamp}>
              <EditIcon className={styles.icon} />
              {getFormattedDate(props.editTimestamp)}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
