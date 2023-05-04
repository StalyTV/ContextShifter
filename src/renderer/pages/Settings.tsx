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

export default function Settings() {
  let loopRef: NodeJS.Timeout | undefined;
  const [status, setStatus] = useState<ExtensionsStatus>({
    isVSCodeConnected: false,
    isBrowserConnected: false,
  });
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);
  const [isFetchingSettings, setIsFetchingSettings] = useState<boolean>(false);

  const getConnectionStatus = async () => {
    try {
      const latestStatus = await window.electron.ipcRenderer.invoke(
        'get-extensions-status'
      );
      setStatus(latestStatus);
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

  const onClickOpenConfig = async () => {
    await window.electron.ipcRenderer.invoke('open-config');
  };

  const onToggleColorTheme = async () => {
    await window.electron.ipcRenderer.invoke('toggle-color-theme');
  };

  useEffect(() => {
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

      <h4>Connection Status to Extensions</h4>
      <div className={styles.connections}>
        <div className={styles.connection}>
          <div
            className={`${styles.circle} ${
              status.isVSCodeConnected ? styles.connected : undefined
            }`}
          ></div>
          <span>VSCode</span>
        </div>
        <div className={styles.connection}>
          <div
            className={`${styles.circle} ${
              status.isBrowserConnected ? styles.connected : undefined
            }`}
          ></div>
          <span>Browser</span>
        </div>
      </div>

      <h4>Configuration</h4>
      <Button isFilled={false} onClick={() => onClickOpenConfig()}>
        Open Config File
      </Button>
    </div>
  );
}
