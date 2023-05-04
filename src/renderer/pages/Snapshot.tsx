/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, March 2023
 */

import styles from './Snapshot.module.scss';
import { useEffect, useState } from 'react';
import SnapshotEntity from 'main/entity/Snapshot';
import ApplicationEntity from '../../main/entity/Application';
import BrowserEntity from '../../main/entity/Browser';
import IDEEntity from '../../main/entity/IDE';
import Browser from 'renderer/components/Browser';
import IDE from '../components/IDE';
import Application from 'renderer/components/Application';
import Button from 'renderer/components/Button';
import PostIt from 'renderer/components/PostIt';
import { toast } from 'react-toastify';
import NavBar from '../components/Navigation/NavBar';
import SnapshotHeader from 'renderer/components/SnapshotHeader';
import PostponeButton from 'renderer/components/PostponeButton';
import LoadingAnimation from 'renderer/components/LoadingAnimation';
import SaveIcon from 'renderer/components/Icons/SaveIcon';

export default function Snapshot() {
  const [selectedSnapshot, setSelectedSnapshot] =
    useState<SnapshotEntity | null>(null);
  const [snapshotName, setSnapshotName] = useState<string>('');
  const [editTimestamp, setEditTimestamp] = useState<string>('');
  const [summary, setSummary] = useState<string>('');
  const [intent, setIntent] = useState<string>('');
  const [browserMap, setBrowserMap] = useState<Map<number, BrowserEntity>>(
    new Map()
  );
  const [ideMap, setIDEMap] = useState<Map<number, IDEEntity>>(new Map());
  const [applicationMap, setApplicationMap] = useState<
    Map<number, ApplicationEntity>
  >(new Map());

  const registerEventListeners = () => {
    window.electron.onSnapshotSelected(fetchSnapshot);
  };

  const unRegisterEventListeners = () => {
    window.electron.removeOnSnapshotSelected();
  };

  const fetchSnapshot = async (e: Electron.IpcRendererEvent, id: number) => {
    const snapshot = await window.electron.ipcRenderer.invoke(
      'get-snapshot-by-id',
      id
    );
    if (!snapshot) return;

    setSelectedSnapshot(snapshot);
    setSnapshotName(snapshot.name);
    setEditTimestamp(snapshot.edited);
    setSummary(snapshot.summary || '');
    setIntent(snapshot.intent || '');

    const browserMap = new Map(snapshot.browsers.map((i) => [i.id, i]));
    setBrowserMap(browserMap);
    const ideMap = new Map(snapshot.ides.map((i) => [i.id, i]));
    setIDEMap(ideMap);
    const applicationMap = new Map(snapshot.applications.map((i) => [i.id, i]));
    setApplicationMap(applicationMap);
  };

  const reapplyChanges = (snapshot: SnapshotEntity) => {
    snapshot.name = snapshotName;
    snapshot.summary = summary;
    snapshot.intent = intent;
    snapshot.browsers = [...browserMap.values()];
    snapshot.ides = [...ideMap.values()];
    snapshot.applications = [...applicationMap.values()];
    return snapshot;
  };

  const onClickSave = async () => {
    if (!selectedSnapshot) return;

    const updatedSnapshot = reapplyChanges(selectedSnapshot);
    toast.promise(async () => sendSaveRequest(updatedSnapshot), {
      pending: 'Saving Snapshot...',
      success: 'Saved Snapshot',
      error: 'Something went wrong',
    });
  };

  const sendSaveRequest = async (updatedSnapshot: SnapshotEntity) => {
    await window.electron.ipcRenderer.invoke('save-snapshot', updatedSnapshot);

    // this avoids refetching the whole db entry just to get the updated timestamp
    setEditTimestamp(new Date().toISOString());
  };

  const onClickSaveAndClose = async () => {
    if (!selectedSnapshot) return;

    const updatedSnapshot = reapplyChanges(selectedSnapshot);
    toast.promise(
      async () =>
        await window.electron.ipcRenderer.invoke(
          'save-snapshot-and-close-applications',
          updatedSnapshot
        ),
      {
        pending: 'Saving Snapshot...',
        success: 'Saved Snapshot, Closed Applications',
        error: 'Something went wrong',
      }
    );
  };

  const onClickOpenArtifacts = async () => {
    if (!selectedSnapshot) return;

    const updatedSnapshot = reapplyChanges(selectedSnapshot);
    toast.promise(
      async () =>
        await window.electron.ipcRenderer.invoke(
          'open-all-artifacts-of-snapshot',
          updatedSnapshot
        ),
      {
        pending: 'Opening Artifacts...',
        success: 'Opened Artifacts',
        error: 'Something went wrong',
      }
    );
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

  const updateBrowser = (updatedBrowser: BrowserEntity) => {
    const updatedMap = new Map(browserMap);
    updatedMap.set(updatedBrowser.id, updatedBrowser);
    setBrowserMap(updatedMap);
  };

  const updateIDE = (updatedIDE: IDEEntity) => {
    const updatedMap = new Map(ideMap);
    updatedMap.set(updatedIDE.id, updatedIDE);
    setIDEMap(updatedMap);
  };

  const postponeSnapshot = (timeInMin: number) => {
    if (!selectedSnapshot) return;

    toast.promise(
      async () =>
        await window.electron.ipcRenderer.invoke(
          'postpone-snapshot',
          selectedSnapshot,
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
    registerEventListeners();

    return () => {
      unRegisterEventListeners();
    };
  }, []);

  return (
    <>
      <NavBar />
      {!selectedSnapshot ? (
        <LoadingAnimation />
      ) : (
        <>
          <div className={styles.headerContainer}>
            <SnapshotHeader
              snapshotName={snapshotName}
              createTimestamp={selectedSnapshot.created}
              editTimestamp={editTimestamp}
              onNameChange={onNameChange}
            />
          </div>
          <div className={styles.mainContainer}>
            <div className={styles.leftContainer}>
              <PostIt
                title={'Now what was I doing?'}
                content={`⏪ ${summary}`}
                onTextChange={onSummaryChange}
              />
              <PostIt
                title={'What was I about to do?'}
                content={`💭 ${intent}`}
                onTextChange={onIntentChange}
              />
            </div>
            <div className={styles.rightContainer}>
              <div className={styles.header}>
                {'Artifacts that I consider relevant for this task snapshot'}
              </div>
              <div>
                {[...browserMap.values()].map((browser) => (
                  <Browser
                    key={browser.id}
                    browser={browser}
                    updateBrowser={updateBrowser}
                  />
                ))}
              </div>
              <div>
                {[...ideMap.values()].map((ide) => (
                  <IDE key={ide.id} ide={ide} updateIDE={updateIDE} />
                ))}
              </div>
              <div>
                {[...applicationMap.values()].map((app) => (
                  <Application
                    key={app.id}
                    app={app}
                    updateApplication={updateApplication}
                  />
                ))}
              </div>
            </div>
          </div>
          <div className={styles.buttonContainer}>
            <PostponeButton
              isFilled={false}
              title={'Postpone Curation'}
              onSelect={postponeSnapshot}
            />
            <Button isFilled={false} onClick={() => onClickOpenArtifacts()}>
              Open Selected Artifacts
            </Button>
            <Button isFilled={false} onClick={() => onClickSaveAndClose()}>
              <>
                <SaveIcon /> <span>&nbsp;Snapshot & Close Applications</span>
              </>
            </Button>
            <Button isFilled={true} onClick={() => onClickSave()}>
              <SaveIcon /> <span>&nbsp;Snapshot</span>
            </Button>
          </div>
        </>
      )}
    </>
  );
}
