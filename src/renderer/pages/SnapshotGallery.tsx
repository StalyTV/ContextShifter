/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, April 2023
 */

import styles from './SnapshotGallery.module.scss';
import { useEffect, useState } from 'react';
import SnapshotEntity from 'main/entity/Snapshot';
import SnapshotPreview from 'renderer/components/SnapshotPreview';
import NavBar from 'renderer/components/Navigation/NavBar';

export default function SnapshotGallery() {
  const [snapshots, setSnapshots] = useState<SnapshotEntity[]>([]);

  const fetchSnapshots = async () => {
    const snapshot = await window.electron.ipcRenderer.invoke(
      'get-latest-snapshot'
    );
    if (!snapshot) return;

    setSnapshots([snapshot]);
  };

  const onClickSnapshot = async (snapshotId: number) => {
    await window.electron.ipcRenderer.invoke('open-snapshot', snapshotId);
  };

  useEffect(() => {
    fetchSnapshots();
  }, []);

  return (
    <>
      <NavBar />
      <h1>Snapshot Gallery</h1>
      {snapshots.map((snapshot) => {
        return (
          <div
            key={snapshot.id}
            onClick={() => {
              onClickSnapshot(snapshot.id);
            }}
          >
            <SnapshotPreview snapshot={snapshot} />
          </div>
        );
      })}
    </>
  );
}
