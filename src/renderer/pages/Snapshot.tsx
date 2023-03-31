/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, March 2023
 */

import styles from './Snapshot.module.scss';
import SnapshotEntity from 'main/entity/Snapshot';
import ApplicationEntity from '../../main/entity/Application';
import { useEffect, useState } from 'react';
import Application from 'renderer/components/Application';
import Button from 'renderer/components/Button';
import PostIt from 'renderer/components/PostIt';
import { toast } from 'react-toastify';
import NavBar from '../components/Navigation/NavBar';

export default function Snapshot() {
  const [latestSnapshot, setLatestSnapshot] = useState<SnapshotEntity | null>(
    null
  );
  const [snapshotName, setSnapshotName] = useState<string>('');
  const [summary, setSummary] = useState<string>('');
  const [intent, setIntent] = useState<string>('');
  const [applicationMap, setApplicationMap] = useState<
    Map<number, ApplicationEntity>
  >(new Map());

  const fetchLatestSnapshot = async () => {
    const snapshot = await window.electron.ipcRenderer.invoke(
      'get-latest-snapshot'
    );
    if (!snapshot) return;

    setLatestSnapshot(snapshot);
    setSnapshotName(snapshot.name);
    setSummary(snapshot.summary);
    setIntent(snapshot.intent);

    const applicationMap = new Map(snapshot.applications.map((i) => [i.id, i]));
    setApplicationMap(applicationMap);
  };

  const onClickSave = async () => {
    if (latestSnapshot) {
      latestSnapshot.name = snapshotName;
      latestSnapshot.summary = summary;
      latestSnapshot.intent = intent;
      latestSnapshot.applications = [...applicationMap.values()];

      toast.promise(
        async () =>
          await window.electron.ipcRenderer.invoke(
            'update-snapshot',
            latestSnapshot
          ),
        {
          pending: 'Saving Snapshot...',
          success: 'Saved Snapshot',
          error: 'Something went wrong',
        }
      );
    }
  };

  const onNameChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setSnapshotName(e.target.value);
  };

  const onSummaryChange = async (text: string) => {
    setSummary(text);
  };

  const onIntentChange = async (text: string) => {
    setIntent(text);
  };

  const updateApplication = (updatedApp: ApplicationEntity) => {
    const updatedMap = new Map(applicationMap);
    updatedMap.set(updatedApp.id, updatedApp);
    setApplicationMap(updatedMap);
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
      <NavBar />
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
            <div className={styles.leftContainer}>
              <PostIt
                title={'Now what was I doing?'}
                content={summary}
                onTextChange={onSummaryChange}
              />
              <PostIt
                title={'What was I about to do?'}
                content={intent}
                onTextChange={onIntentChange}
              />
            </div>
            <div className={styles.rightContainer}>
              {[...applicationMap.values()].map((app) => (
                <Application
                  key={app.id}
                  app={app}
                  updateApplication={updateApplication}
                />
              ))}
            </div>
          </div>
          <div className={styles.buttonContainer}>
            <Button isFilled={true} onClick={() => onClickSave()}>
              Save
            </Button>
          </div>
        </>
      ) : (
        <p>Error: No Snapshot found</p>
      )}
    </>
  );
}
