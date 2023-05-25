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
import LoadingAnimation from 'renderer/components/LoadingAnimation';

export default function InstantCuration() {
  const [snapshot, setSnapshot] = useState<SnapshotEntity | null>(null);
  const [snapshotName, setSnapshotName] = useState<string>('');
  const [isSnapshotReady, setIsSnapshotReady] = useState<boolean>(false);

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

  const fetchLatestSnapshot = async () => {
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

  const onClickMerge = async () => {
    if (!snapshot) return;

    if (
      confirm(
        `Are you sure you want to merge this snapshot with [other snapshot]?`
      ) === true
    ) {
      toast.promise(
        async () => {
          await window.electron.ipcRenderer.invoke(
            'merge-snapshots',
            snapshot.id,
            43 //TODO Don't hardcode this
          ),
            await fetchSnapshotById(43);
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
    fetchLatestSnapshot();
    registerEventListeners();

    return () => {
      unRegisterEventListeners();
    };
  }, []);

  return (
    <>
      {snapshot ? (
        <>
          <div className={styles.headerContainer}>
            <SnapshotHeader
              snapshotName={snapshotName}
              onNameChange={onNameChange}
              createTimestamp={snapshot.created}
              editTimestamp={snapshot.edited}
              showTimestamp={false}
            />
          </div>
          {isSnapshotReady ? (
            <div className={styles.buttonContainer}>
              <Button isFilled={true} onClick={() => onClickCurateNow()}>
                Curate Now
              </Button>
              <PostponeButton
                isFilled={false}
                title={'PostponeCuration'}
                onSelect={postponeSnapshot}
              />
              <Button
                className={styles.deleteButton}
                isFilled={true}
                onClick={() => onClickDelete()}
              >
                <TrashIcon />
              </Button>
              <Button isFilled={false} onClick={() => onClickMerge()}>
                {'Merge into snapshot'}
              </Button>
            </div>
          ) : (
            <div className={styles.loadingContainer}>
              <LoadingAnimation />
              <span>Preparing Snapshot...</span>
            </div>
          )}
        </>
      ) : null}
    </>
  );
}
