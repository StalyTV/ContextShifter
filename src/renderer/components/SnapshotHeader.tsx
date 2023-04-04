/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, April 2023
 */

import Input from './Input';
import styles from './SnapshotHeader.module.scss';

type Props = {
  snapshotName: string;
  timestamp: string;
  onNameChange: (e: React.ChangeEvent<HTMLInputElement>) => {};
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
      <div className={styles.timestamp}>
        {getFormattedDate(props.timestamp)}
      </div>
    </div>
  );
}
