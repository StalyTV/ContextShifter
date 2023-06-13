/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, June 2023
 */

import { useEffect, useState } from 'react';
import styles from './MentalContext.module.scss';
import SnapshotEntity from '../../main/entity/Snapshot';
import LoadingAnimation from 'renderer/components/LoadingAnimation';
import PostItSection from 'renderer/components/PostItSection';

export default function MentalContext() {
  const [snapshot, setSnapshot] = useState<SnapshotEntity | null>(null);

  const registerEventListeners = () => {
    window.electron.onSnapshotSelected(fetchSnapshot);
  };

  const unRegisterEventListeners = () => {
    window.electron.removeOnSnapshotSelected();
  };

  const fetchSnapshot = async (
    e: Electron.IpcRendererEvent,
    snapshotId: number
  ) => {
    const fetchedSnapshot = await window.electron.ipcRenderer.invoke(
      'get-snapshot-by-id',
      snapshotId
    );
    if (!fetchedSnapshot) return;
    setSnapshot(fetchedSnapshot);
  };

  useEffect(() => {
    registerEventListeners();

    return () => {
      unRegisterEventListeners();
    };
  }, []);

  return (
    <>
      {snapshot ? (
        <>
          <h1 className={styles.noMarginBottom}>{`${snapshot.name}`}</h1>
          <p>
            The snapshot's artifacts are loading. Below, you can see where you
            left off (if provided).
          </p>
          <PostItSection
            summary={snapshot.summary}
            onSummaryChange={() => {}}
            intent={snapshot.intent}
            onIntentChange={() => {}}
            isEditable={false}
          />
        </>
      ) : (
        <LoadingAnimation />
      )}
    </>
  );
}
