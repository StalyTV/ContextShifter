/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, March 2023
 */

import styles from './Snapshot.module.scss';
import SnapshotEntity from 'main/entity/Snapshot';
import { useEffect, useState } from 'react';
import Application from 'renderer/components/Application';
import Button from 'renderer/components/Button';

export default function Snapshot() {
  const [latestSnapshot, setLatestSnapshot] = useState<SnapshotEntity | null>(
    null
  );
  const [snapshotName, setSnapshotName] = useState<string>('');

  const fetchLatestSnapshot = async () => {
    const snapshot = await window.electron.ipcRenderer.invoke(
      'get-latest-snapshot'
    );
    setLatestSnapshot(snapshot);
    setSnapshotName(snapshot ? snapshot.name : '');
  };

  const onNameChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setSnapshotName(e.target.value);
  };

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

  useEffect(() => {
    fetchLatestSnapshot();
  }, []);

  return (
    <>
      {latestSnapshot ? (
        <>
          <div className={styles.header}>
            <div className={styles.titleContainer}>
              <input value={snapshotName} onChange={onNameChange} />
            </div>
            <div className={styles.timestamp}>
              {getFormattedDate(latestSnapshot.created)}
            </div>
          </div>
          <div className={styles.mainContainer}>
            <div className={styles.leftContainer}></div>
            <div className={styles.rightContainer}>
              {latestSnapshot.applications.map((app) => (
                <Application app={app} />
              ))}
            </div>
          </div>
          <div className={styles.buttonContainer}>
            <Button isFilled={true}>Save</Button>
          </div>
        </>
      ) : (
        <p>Error: No Snapshot found</p>
      )}
    </>
  );
}
