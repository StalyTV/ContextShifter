/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, April 2023
 */

import styles from './InstantCuration.module.scss';
import { useEffect, useState } from 'react';
import SnapshotHeader from 'renderer/components/SnapshotHeader';
import SnapshotEntity from 'main/entity/Snapshot';
import Button from 'renderer/components/Button';
import { toast } from 'react-toastify';

export default function InstantCuration() {
  const [latestSnapshot, setLatestSnapshot] = useState<SnapshotEntity | null>(
    null
  );
  const [snapshotName, setSnapshotName] = useState<string>('');

  const fetchLatestSnapshot = async () => {
    const snapshot = await window.electron.ipcRenderer.invoke(
      'get-latest-snapshot'
    );
    if (!snapshot) return;

    setLatestSnapshot(snapshot);
    setSnapshotName(snapshot.name);
  };

  const onNameChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setSnapshotName(e.target.value);
  };

  const onClickCurateNow = async () => {
    if (!latestSnapshot) return;

    toast.promise(
      async () =>
        await window.electron.ipcRenderer.invoke(
          'instant-curation-curate-now',
          latestSnapshot.id,
          snapshotName
        ),
      {
        pending: 'Opening Snapshot...',
        success: 'Snapshot Opened',
        error: 'Something went wrong',
      }
    );
  };

  useEffect(() => {
    fetchLatestSnapshot();
  }, []);

  return (
    <>
      {latestSnapshot ? (
        <>
          <div className={styles.headerContainer}>
            <SnapshotHeader
              snapshotName={snapshotName}
              onNameChange={onNameChange}
              timestamp={latestSnapshot.created}
            />
          </div>
          <div className={styles.buttonContainer}>
            <Button isFilled={true} onClick={() => {}}>
              Postpone Curation
            </Button>
            <Button isFilled={true} onClick={() => onClickCurateNow()}>
              Curate Now
            </Button>
          </div>
        </>
      ) : null}
    </>
  );
}
