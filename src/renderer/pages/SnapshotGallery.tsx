/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, April 2023
 */

import styles from './SnapshotGallery.module.scss';
import { useEffect, useState } from 'react';
import SnapshotEntity from '../../main/entity/Snapshot';
import SnapshotPreview from '../components/Gallery/SnapshotPreview';
import NavBar from '../components/Navigation/NavBar';
import Button from 'renderer/components/Button';

export default function SnapshotGallery() {
  const [snapshotMap, setSnapshotMap] = useState<Map<number, SnapshotEntity[]>>(
    new Map()
  );
  const [totalNumSnapshots, setTotalNumSnapshots] = useState<number>(0);
  const [shownNumSnapshots, setShownNumSnapshots] = useState<number>(10);

  const registerEventListeners = () => {
    window.electron.onSnapshotsUpdated(() => fetchSnapshots());
  };

  const unRegisterEventListeners = () => {
    window.electron.removeOnSnapshotsUpdated();
  };

  const fetchSnapshots = async (amount: number = shownNumSnapshots) => {
    const numSnapshots = await window.electron.ipcRenderer.invoke(
      'get-total-num-snapshots'
    );
    setTotalNumSnapshots(numSnapshots);
    const snapshots = await window.electron.ipcRenderer.invoke(
      'get-latest-n-snapshots',
      amount
    );

    const initialMap: Map<number, SnapshotEntity[]> = new Map();
    snapshots.forEach((snapshot) => {
      const lastChangeDate = new Date(snapshot.lastChange);
      const key: number = lastChangeDate.setHours(0, 0, 0, 0);
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

  const increaseShownNumSnapshots = () => {
    const newAmount = shownNumSnapshots + 10;
    setShownNumSnapshots(newAmount);
    fetchSnapshots(newAmount);
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
    registerEventListeners();

    return () => {
      unRegisterEventListeners();
    };
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
      {shownNumSnapshots < totalNumSnapshots ? (
        <>
          <Button
            className={styles.loadMoreButton}
            isFilled={false}
            onClick={() => increaseShownNumSnapshots()}
          >
            Load More...
          </Button>
        </>
      ) : null}
    </>
  );
}
