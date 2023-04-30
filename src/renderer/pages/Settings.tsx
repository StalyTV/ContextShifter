/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, April 2023
 */

import { useEffect, useState } from 'react';
import styles from './Settings.module.scss';
import ExtensionsStatus from '../../types/ExtensionsStatus';
import Button from 'renderer/components/Button';

export default function Settings() {
  let loopRef: NodeJS.Timeout | undefined;
  const [status, setStatus] = useState<ExtensionsStatus>({
    isVSCodeConnected: false,
    isBrowserConnected: false,
  });

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

  const onClickOpenConfig = async () => {
    await window.electron.ipcRenderer.invoke('open-config');
  };

  useEffect(() => {
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
