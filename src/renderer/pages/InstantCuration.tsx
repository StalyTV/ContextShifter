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
import PostponeButton from 'renderer/components/PostponeButton';
import TrashIcon from 'renderer/components/Icons/TrashIcon';
import HourglassIcon from 'renderer/components/Icons/HourglassIcon';

export default function InstantCuration() {
  const [snapshot, setSnapshot] = useState<SnapshotEntity | null>(null);
  const [snapshotName, setSnapshotName] = useState<string>('');
  const [isSnapshotReady, setIsSnapshotReady] = useState<boolean>(false);
  const [mergeRecommendations, setMergeRecommendations] = useState<
    SnapshotEntity[]
  >([]);

  const registerEventListeners = () => {
    window.electron.onSnapshotReady(() => {
      setIsSnapshotReady(true);
      toast('Saved Snapshot', {
        type: 'success',
      });
    });
  };

  const unRegisterEventListeners = () => {
    window.electron.removeOnSnapshotReady();
  };

  const init = async () => {
    const latestSnapshot = await window.electron.ipcRenderer.invoke(
      'get-latest-snapshot'
    );
    if (!latestSnapshot) return;
    setFetchedSnapshot(latestSnapshot);
    if (latestSnapshot.isReady) {
      toast('Saved Snapshot', {
        type: 'success',
      });
    }
    fetchMergeRecommendations(latestSnapshot.id);
  };

  const fetchMergeRecommendations = async (excludeId: number) => {
    const recommendations = await window.electron.ipcRenderer.invoke(
      'get-merge-recommendations'
    );
    // filter out the snapshot that is currently edited
    const filteredSnapshots = recommendations.filter(
      (rec) => rec.id !== excludeId
    );
    setMergeRecommendations(filteredSnapshots);
  };

  const fetchSnapshotById = async (id: number) => {
    const requestedSnapshot = await window.electron.ipcRenderer.invoke(
      'get-snapshot-by-id',
      id
    );
    if (!requestedSnapshot) return;
    setFetchedSnapshot(requestedSnapshot);
  };

  const setFetchedSnapshot = async (snapshot: SnapshotEntity) => {
    setSnapshot(snapshot);
    setSnapshotName(snapshot.name);
    setIsSnapshotReady(snapshot.isReady);
  };

  const onNameChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setSnapshotName(e.target.value);
  };

  const onClickCurateNow = async () => {
    if (!snapshot) return;

    toast.promise(
      async () =>
        await window.electron.ipcRenderer.invoke(
          'instant-curation-curate-now',
          snapshot.id,
          snapshotName
        ),
      {
        pending: 'Opening Snapshot...',
        success: 'Snapshot Opened',
        error: 'Something went wrong',
      }
    );
  };

  const onClickCloseApps = async () => {
    if (!snapshot) return;

    toast.promise(
      async () =>
        await window.electron.ipcRenderer.invoke(
          'instant-curation-close-applications',
          snapshot.id,
          snapshotName
        ),
      {
        pending: 'Saving Snapshot...',
        success: 'Saved Snapshot, Closed Applications',
        error: 'Something went wrong',
      }
    );
  };

  const onClickDelete = async () => {
    if (!snapshot) return;

    if (
      confirm(`Are you sure that you want to delete "${snapshotName}"?`) ===
      true
    ) {
      toast.promise(
        async () =>
          await window.electron.ipcRenderer.invoke(
            'instant-curation-delete-snapshot',
            snapshot.id
          ),
        {
          pending: 'Deleting Snapshot...',
          success: 'Snapshot Deleted',
          error: 'Something went wrong',
        }
      );
    }
  };

  const onSelectMergeDestination = async (
    e: React.ChangeEvent<HTMLSelectElement>
  ) => {
    if (!snapshot) return;
    const targetId = parseInt(e.target.value);
    e.target.value = ''; // reset selection

    const targetSnapshot = mergeRecommendations.find(
      (snap) => snap.id === targetId
    );
    if (!targetSnapshot) return;

    if (
      confirm(
        `Are you sure you want to merge this snapshot with "${targetSnapshot.name}"?`
      ) === true
    ) {
      toast.promise(
        async () => {
          await window.electron.ipcRenderer.invoke(
            'merge-snapshots',
            snapshot.id,
            targetId
          ),
            await fetchSnapshotById(targetId);
        },
        {
          pending: 'Merging Snapshots...',
          success: 'Snapshots Merged',
          error: 'Something went wrong',
        }
      );
    }
  };

  const postponeSnapshot = (timeInMin: number) => {
    if (!snapshot) return;

    toast.promise(
      async () =>
        await window.electron.ipcRenderer.invoke(
          'instant-curation-postpone',
          snapshot.id,
          snapshotName,
          timeInMin
        ),
      {
        pending: 'Postponing Snapshot...',
        success: 'Postponed Snapshot',
        error: 'Something went wrong',
      }
    );
  };

  useEffect(() => {
    init();
    registerEventListeners();

    return () => {
      unRegisterEventListeners();
    };
  }, []);

  return (
    <>
      {snapshot ? (
        <>
          <div className={styles.header}>
            <div className={styles.snapshotHeaderContainer}>
              <SnapshotHeader
                snapshotName={snapshotName}
                onNameChange={onNameChange}
                createTimestamp={snapshot.created}
                editTimestamp={snapshot.edited}
                showTimestamp={false}
              />
            </div>
            {isSnapshotReady ? (
              <TrashIcon
                className={`${styles.icon} ${styles.clickable}`}
                onClick={() => onClickDelete()}
              />
            ) : (
              <HourglassIcon className={styles.icon} />
            )}
          </div>

          <div className={styles.buttonContainer}>
            <Button isFilled={true} onClick={() => onClickCurateNow()}>
              Curate Now
            </Button>
            <PostponeButton
              isFilled={false}
              title={'Postpone Curation'}
              onSelect={postponeSnapshot}
            />
            <select
              className={styles.mergeButton}
              onChange={onSelectMergeDestination}
              name="select-merge"
              id="select-merge"
              disabled={isSnapshotReady ? false : true}
            >
              <option value="">Amend Snapshot</option>
              {mergeRecommendations.map((mRec) => (
                <option key={mRec.id} value={mRec.id}>
                  {mRec.name}
                </option>
              ))}
            </select>
            <Button
              isFilled={false}
              onClick={() => onClickCloseApps()}
              disabled={isSnapshotReady ? false : true}
            >
              Close Applications
            </Button>
          </div>
        </>
      ) : null}
    </>
  );
}
