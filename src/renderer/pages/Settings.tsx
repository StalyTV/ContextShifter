/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, April 2023
 */

import { useEffect, useState } from 'react';
import styles from './Settings.module.scss';
import ExtensionsStatus from '../../types/ExtensionsStatus';
import TaskSnapToggle from '../components/Toggle/TaskSnapToggle';
import KnownApplicationEntity from '../../main/entity/KnownApplication';
import PlusIcon from '../components/Icons/PlusIcon';
import InfoIcon from '../components/Icons/InfoIcon';
import UserSettings from 'types/UserSettings';
import Input from '../components/Input';

export default function Settings() {
  let loopRef: NodeJS.Timeout | undefined;
  const [extensionStatus, setExtensionStatus] = useState<ExtensionsStatus>({
    isVSCodeConnected: false,
    isBrowserConnected: false,
  });
  const [deviceStatus, setDeviceStatus] = useState<boolean>(false);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);
  const [isDataAnonymized, setIsDataAnonymized] = useState<boolean>(false);
  const [snapshotShortcut, setSnapshotShortcut] = useState<string>('');
  const [neverCloseApplications, setNeverCloseApplications] = useState<
    KnownApplicationEntity[]
  >([]);
  const [otherApplications, setOtherApplications] = useState<
    KnownApplicationEntity[]
  >([]);
  const [isFetchingSettings, setIsFetchingSettings] = useState<boolean>(false);

  const getSettings = async () => {
    setIsFetchingSettings(true);
    try {
      const settings = await window.electron.ipcRenderer.invoke('get-settings');
      setIsDarkMode(settings.isDarkModeEnabled);
      setIsDataAnonymized(settings.isDataAnonymized);
      setSnapshotShortcut(settings.snapshotShortcut);
    } catch (err) {
      console.error(err);
    }
    setIsFetchingSettings(false);
  };

  const setSettings = async (settings: UserSettings) => {
    await window.electron.ipcRenderer.invoke('set-settings', settings);
  };

  const getConnectionStatus = async () => {
    try {
      const latestExtensionStatus = await window.electron.ipcRenderer.invoke(
        'get-extensions-status'
      );
      setExtensionStatus(latestExtensionStatus);

      const latestDeviceStatus = await window.electron.ipcRenderer.invoke(
        'get-device-status'
      );
      setDeviceStatus(latestDeviceStatus);
    } catch (err) {
      console.error(err);
    }
  };

  const getKnownApplications = async () => {
    try {
      const fetchedApplications = await window.electron.ipcRenderer.invoke(
        'get-known-applications'
      );

      const neverCloseApps = fetchedApplications.filter((app) => {
        return app.neverClose;
      });
      setNeverCloseApplications(neverCloseApps);
      const otherApps = fetchedApplications.filter((app) => {
        return !app.neverClose;
      });
      setOtherApplications(otherApps);
    } catch (err) {
      console.error(err);
    }
  };

  const onClickNeverCloseApp = async (app: KnownApplicationEntity) => {
    app.neverClose = !app.neverClose;
    const updatedNeverCloseApps = neverCloseApplications.filter((appInList) => {
      return appInList.id !== app.id;
    });
    setNeverCloseApplications(updatedNeverCloseApps);
    setOtherApplications([...otherApplications, app]);

    await updateKnownApplication(app);
  };

  const onClickOtherApp = async (app: KnownApplicationEntity) => {
    app.neverClose = !app.neverClose;
    const updatedOtherApps = otherApplications.filter((appInList) => {
      return appInList.id !== app.id;
    });
    setOtherApplications(updatedOtherApps);
    setNeverCloseApplications([...neverCloseApplications, app]);

    await updateKnownApplication(app);
  };

  const updateKnownApplication = async (app: KnownApplicationEntity) => {
    await window.electron.ipcRenderer.invoke('update-known-application', app);
  };

  const onToggleColorTheme = async () => {
    const updatedSettings: UserSettings = {
      isDarkModeEnabled: !isDarkMode,
      isDataAnonymized: isDataAnonymized,
      snapshotShortcut: snapshotShortcut,
    };
    setIsDarkMode(!isDarkMode);
    setSettings(updatedSettings);
  };

  const onToggleDataAnonymization = async () => {
    const updatedSettings: UserSettings = {
      isDarkModeEnabled: isDarkMode,
      isDataAnonymized: !isDataAnonymized,
      snapshotShortcut: snapshotShortcut,
    };
    setIsDataAnonymized(!isDataAnonymized);
    setSettings(updatedSettings);
  };

  const onShortcutChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const updatedShortcut = e.target.value;
    const updatedSettings: UserSettings = {
      isDarkModeEnabled: isDarkMode,
      isDataAnonymized: !isDataAnonymized,
      snapshotShortcut: updatedShortcut,
    };
    setSnapshotShortcut(updatedShortcut);
    setSettings(updatedSettings);
  };

  useEffect(() => {
    getSettings();
    getKnownApplications();
    getConnectionStatus();
    loopRef = setInterval(() => {
      getConnectionStatus();
    }, 2000);

    return () => {
      if (loopRef) clearInterval(loopRef);
    };
  }, []);

  return (
    <div className={styles.settingsContainer}>
      <h3>Settings</h3>
      {isFetchingSettings ? null : (
        <div>
          <h4>Color Theme</h4>
          <TaskSnapToggle
            defaultChecked={isDarkMode}
            leftLabel={'light'}
            rightLabel={'dark'}
            icons={false}
            onChange={onToggleColorTheme}
          />
          <h4>Anonymize Data</h4>
          <TaskSnapToggle
            defaultChecked={isDataAnonymized}
            leftLabel={'no'}
            rightLabel={'yes'}
            icons={false}
            onChange={onToggleDataAnonymization}
          />
          <div className={styles.titleWithInfo}>
            <h4>Snapshot Shortcut</h4>
            <InfoIcon
              className={styles.infoIcon}
              data-tooltip-id={'task-snap'}
              data-tooltip-html={'Restart required'}
            />
          </div>
          <div className={styles.inputContainer}>
            <Input value={snapshotShortcut} onChange={onShortcutChange} />
          </div>
        </div>
      )}

      <h4>Connection Status</h4>
      <div className={styles.connections}>
        <div className={styles.connection}>
          <div
            className={`${styles.circle} ${
              extensionStatus.isVSCodeConnected ? styles.connected : undefined
            }`}
          ></div>
          <span>VSCode Extension</span>
        </div>
        <div className={styles.connection}>
          <div
            className={`${styles.circle} ${
              extensionStatus.isBrowserConnected ? styles.connected : undefined
            }`}
          ></div>
          <span>Browser Extension</span>
        </div>
        <div className={styles.connection}>
          <div
            className={`${styles.circle} ${
              deviceStatus ? styles.connected : undefined
            }`}
          ></div>
          <span>Physical Button</span>
        </div>
      </div>

      <div className={styles.titleWithInfo}>
        <h4>Apps that should never be closed</h4>
        <InfoIcon
          className={styles.infoIcon}
          data-tooltip-id={'task-snap'}
          data-tooltip-html={
            'If an app is not listed, make sure it is in focus and reopen the settings window'
          }
        />
      </div>
      <div className={styles.neverCloseApplications}>
        {neverCloseApplications.map((app) => {
          return (
            <img
              key={app.id}
              className={styles.appIcon}
              src={app.icon}
              data-tooltip-id={'task-snap'}
              data-tooltip-content={app.name}
              onClick={() => onClickNeverCloseApp(app)}
            />
          );
        })}
      </div>
      <div className={styles.otherApplications}>
        <PlusIcon className={styles.plusIcon} />
        {otherApplications.map((app) => {
          return (
            <img
              key={app.id}
              className={styles.appIcon}
              src={app.icon}
              data-tooltip-id={'task-snap'}
              data-tooltip-content={app.name}
              onClick={() => onClickOtherApp(app)}
            />
          );
        })}
      </div>
    </div>
  );
}
