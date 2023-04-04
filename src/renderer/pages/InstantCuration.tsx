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

  useEffect(() => {
    fetchLatestSnapshot();
  }, []);

  return (
    <>
      {latestSnapshot ? (
        <>
          <SnapshotHeader
            snapshotName={snapshotName}
            onNameChange={onNameChange}
            timestamp={latestSnapshot.created}
          />
          <div>
            <Button isFilled={true} onClick={() => {}}>
              Save
            </Button>
          </div>
        </>
      ) : null}
    </>
  );
}
