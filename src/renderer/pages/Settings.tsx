/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, April 2023
 */

import { useEffect, useState } from 'react';
import styles from './Settings.module.scss';
import ExtensionsStatus from '../../types/ExtensionsStatus';
import Button from 'renderer/components/Button';
import TaskSnapToggle from 'renderer/components/Toggle/TaskSnapToggle';
import KnownApplicationEntity from '../../main/entity/KnownApplication';
import PlusIcon from '../components/Icons/PlusIcon';
import InfoIcon from 'renderer/components/Icons/InfoIcon';

export default function Settings() {
  let loopRef: NodeJS.Timeout | undefined;
  const [extensionStatus, setExtensionStatus] = useState<ExtensionsStatus>({
    isVSCodeConnected: false,
    isBrowserConnected: false,
  });
  const [deviceStatus, setDeviceStatus] = useState<boolean>(false);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);
  const [neverCloseApplications, setNeverCloseApplications] = useState<
    KnownApplicationEntity[]
  >([]);
  const [otherApplications, setOtherApplications] = useState<
    KnownApplicationEntity[]
  >([]);
  const [isFetchingSettings, setIsFetchingSettings] = useState<boolean>(false);

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

  const getColorTheme = async () => {
    setIsFetchingSettings(true);
    try {
      const isDarkModeEnabled = await window.electron.ipcRenderer.invoke(
        'is-dark-mode-enabled'
      );
      setIsDarkMode(isDarkModeEnabled);
    } catch (err) {
      console.error(err);
    }
    setIsFetchingSettings(false);
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

  const onClickOpenConfig = async () => {
    await window.electron.ipcRenderer.invoke('open-config');
  };

  const onToggleColorTheme = async () => {
    await window.electron.ipcRenderer.invoke('toggle-color-theme');
  };

  useEffect(() => {
    getKnownApplications();
    getColorTheme();
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
      <h4>Color Theme</h4>
      {isFetchingSettings ? null : (
        <TaskSnapToggle
          defaultChecked={isDarkMode}
          leftLabel={'light'}
          rightLabel={'dark'}
          icons={false}
          onChange={onToggleColorTheme}
        />
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

      <h4>Configuration</h4>
      <Button isFilled={false} onClick={() => onClickOpenConfig()}>
        Open Config File
      </Button>
    </div>
  );
}
