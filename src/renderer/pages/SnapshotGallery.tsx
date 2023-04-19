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
  const [snapshotMap, setSnapshotMap] = useState<Map<number, SnapshotEntity[]>>(
    new Map()
  );

  const fetchSnapshots = async () => {
    const snapshots = await window.electron.ipcRenderer.invoke(
      'get-latest-n-snapshots',
      10
    );

    snapshots.sort((a, b) => {
      const dateA = new Date(a.created).getTime();
      const dateB = new Date(b.created).getTime();
      return dateB - dateA;
    });

    const initialMap: Map<number, SnapshotEntity[]> = new Map();
    snapshots.forEach((snapshot) => {
      const creationDate = new Date(snapshot.created);
      const key: number = creationDate.setHours(0, 0, 0, 0);
      if (initialMap.has(key)) {
        initialMap.get(key)!.push(snapshot);
      } else {
        initialMap.set(key, [snapshot]);
      }
    });
    setSnapshotMap(initialMap);
  };

  const onDelete = () => {
    fetchSnapshots();
  };

  const getFormattedDateFromKey = (key: number): string => {
    const date = new Date(key);
    return date.toLocaleString([], {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  useEffect(() => {
    fetchSnapshots();
  }, []);

  return (
    <>
      <NavBar />
      <h1>Snapshot Gallery</h1>
      {[...snapshotMap.keys()].map((key) => {
        return (
          <div key={key} className={styles.groupOfSnapshots}>
            {getFormattedDateFromKey(key)}
            {snapshotMap.get(key)!.map((snapshot) => {
              return (
                <SnapshotPreview
                  key={snapshot.id}
                  snapshot={snapshot}
                  onDelete={onDelete}
                />
              );
            })}
          </div>
        );
      })}
    </>
  );
}
