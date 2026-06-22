/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, April 2023
 */

import { useEffect, useState } from 'react';
import styles from './Settings.module.scss';
import ExtensionsStatus from '../../types/ExtensionsStatus';
import ContextShifterToggle from '../components/Toggle/ContextShifterToggle';
import KnownApplicationEntity from '../../main/entity/KnownApplication';
import NeverCloseBrowserTabEntity from '../../main/entity/NeverCloseBrowserTab';
import InfoIcon from '../components/Icons/InfoIcon';
import UserSettings from 'types/UserSettings';
import { OpenBrowserTab } from 'types/Commands';
import StudyInstructions from '../components/StudyInstructions';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { byPrefixAndName } from '../fontawesome';

export default function Settings() {
  let loopRef: NodeJS.Timeout | undefined;
  const [extensionStatus, setExtensionStatus] = useState<ExtensionsStatus>({
    isVSCodeConnected: false,
    isBrowserConnected: false,
  });
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);
  const [isDataAnonymized, setIsDataAnonymized] = useState<boolean>(false);
  const [isStudyDataCollectionEnabled, setIsStudyDataCollectionEnabled] =
    useState<boolean>(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  // Persisted but not configurable from this page; round-tripped to keep the
  // existing UserSettings shape stable for the main process / StudyManager.
  const [endOfDayPopUpTime, setEndOfDayPopUpTime] = useState<Date>(
    () => new Date(new Date().setHours(16, 30, 0, 0))
  );
  const [showQuestionnaireOnlyOnWorkdays, setShowQuestionnaireOnlyOnWorkdays] =
    useState<boolean>(true);

  // never-close applications
  const [neverCloseApplications, setNeverCloseApplications] = useState<
    KnownApplicationEntity[]
  >([]);
  // applications currently open that aren't protected yet (the pick-from list)
  const [openApplications, setOpenApplications] = useState<
    KnownApplicationEntity[]
  >([]);

  // never-close browser tabs
  const [neverCloseTabs, setNeverCloseTabs] = useState<
    NeverCloseBrowserTabEntity[]
  >([]);
  const [openBrowserTabs, setOpenBrowserTabs] = useState<OpenBrowserTab[]>([]);

  const [isFetchingSettings, setIsFetchingSettings] = useState<boolean>(false);
  const [showInstructions, setShowInstructions] = useState<boolean>(false);

  const getSettings = async () => {
    setIsFetchingSettings(true);
    try {
      const settings = await window.electron.ipcRenderer.invoke('get-settings');
      setIsDarkMode(settings.isDarkModeEnabled);
      setIsDataAnonymized(settings.isDataAnonymized);
      setIsStudyDataCollectionEnabled(settings.isStudyDataCollectionEnabled);
      setEndOfDayPopUpTime(settings.endOfDayPopUpTime);
      setShowQuestionnaireOnlyOnWorkdays(
        settings.showQuestionnaireOnlyOnWorkdays
      );
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
    } catch (err) {
      console.error(err);
    }
  };

  const getKnownApplications = async () => {
    try {
      const fetchedApplications = await window.electron.ipcRenderer.invoke(
        'get-known-applications'
      );
      setNeverCloseApplications(
        fetchedApplications.filter((app) => app.neverClose)
      );
      // Offer currently-open, not-yet-protected apps to pick from.
      setOpenApplications(
        fetchedApplications.filter(
          (app) => !app.neverClose && app.isCurrentlyOpen
        )
      );
    } catch (err) {
      console.error(err);
    }
  };

  const getBrowserTabs = async () => {
    try {
      const open = await window.electron.ipcRenderer.invoke(
        'get-open-browser-tabs'
      );
      const never = await window.electron.ipcRenderer.invoke(
        'get-never-close-tabs'
      );
      const protectedUrls = new Set(never.map((t) => t.url));
      setNeverCloseTabs(never);
      setOpenBrowserTabs(open.filter((t) => !protectedUrls.has(t.url)));
    } catch (err) {
      console.error(err);
    }
  };

  const refreshChoosers = async () => {
    await getKnownApplications();
    await getBrowserTabs();
  };

  const protectApplication = async (app: KnownApplicationEntity) => {
    app.neverClose = true;
    setOpenApplications((prev) => prev.filter((a) => a.id !== app.id));
    setNeverCloseApplications((prev) => [...prev, app]);
    await window.electron.ipcRenderer.invoke('update-known-application', app);
  };

  const unprotectApplication = async (app: KnownApplicationEntity) => {
    app.neverClose = false;
    setNeverCloseApplications((prev) => prev.filter((a) => a.id !== app.id));
    if (app.isCurrentlyOpen) {
      setOpenApplications((prev) => [...prev, app]);
    }
    await window.electron.ipcRenderer.invoke('update-known-application', app);
  };

  const protectTab = async (tab: OpenBrowserTab) => {
    setOpenBrowserTabs((prev) => prev.filter((t) => t.url !== tab.url));
    await window.electron.ipcRenderer.invoke('add-never-close-tab', tab);
    await getBrowserTabs();
  };

  const unprotectTab = async (tab: NeverCloseBrowserTabEntity) => {
    setNeverCloseTabs((prev) => prev.filter((t) => t.id !== tab.id));
    await window.electron.ipcRenderer.invoke('remove-never-close-tab', tab.id);
    await getBrowserTabs();
  };

  const onToggleColorTheme = async () => {
    const updatedSettings: UserSettings = {
      isDarkModeEnabled: !isDarkMode,
      isDataAnonymized: isDataAnonymized,
      isStudyDataCollectionEnabled: isStudyDataCollectionEnabled,
      endOfDayPopUpTime: endOfDayPopUpTime,
      showQuestionnaireOnlyOnWorkdays: showQuestionnaireOnlyOnWorkdays,
    };
    setIsDarkMode(!isDarkMode);
    setSettings(updatedSettings);
  };

  const onToggleDataCollection = async () => {
    const next = !isStudyDataCollectionEnabled;
    setIsStudyDataCollectionEnabled(next);
    const updatedSettings: UserSettings = {
      isDarkModeEnabled: isDarkMode,
      isDataAnonymized: isDataAnonymized,
      isStudyDataCollectionEnabled: next,
      endOfDayPopUpTime: endOfDayPopUpTime,
      showQuestionnaireOnlyOnWorkdays: showQuestionnaireOnlyOnWorkdays,
    };
    setSettings(updatedSettings);
  };

  const onExportStudyData = async () => {
    setExportMessage(null);
    try {
      const result = await window.electron.ipcRenderer.invoke(
        'export-study-data'
      );
      if (result.canceled) return;
      if (result.count === 0) {
        setExportMessage('No study data collected yet.');
      } else {
        setExportMessage(`Exported ${result.count} record(s).`);
      }
    } catch (err) {
      setExportMessage(`Export failed: ${String(err)}`);
    }
  };

  useEffect(() => {
    getSettings();
    getKnownApplications();
    getBrowserTabs();
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
          <ContextShifterToggle
            defaultChecked={isDarkMode}
            leftLabel={'light'}
            rightLabel={'dark'}
            icons={false}
            onChange={onToggleColorTheme}
          />
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
      </div>

      <h4>Study Settings</h4>
      <div className={styles.studyButtons}>
        <button
          className={styles.studyButton}
          onClick={() => setShowInstructions(true)}
        >
          Study-instructions
        </button>
        <label className={styles.dataCollectionToggle}>
          <input
            type="checkbox"
            checked={isStudyDataCollectionEnabled}
            onChange={onToggleDataCollection}
          />
          <span>Data Collection</span>
        </label>
        <button className={styles.studyButton} onClick={onExportStudyData}>
          <FontAwesomeIcon
            icon={byPrefixAndName.fas['arrow-up-from-bracket']}
          />
          <span>Export Study Data</span>
        </button>
      </div>
      {exportMessage ? (
        <p className={styles.exportMessage}>{exportMessage}</p>
      ) : null}

      <div className={styles.sectionHeader}>
        <div className={styles.titleWithInfo}>
          <h4>Apps that should never be closed</h4>
          <InfoIcon
            className={styles.infoIcon}
            data-tooltip-id={'task-snap'}
            data-tooltip-html={
              'These applications stay open when you switch tasks. Pick from the open apps below to protect one.'
            }
          />
        </div>
        <button className={styles.refreshBtn} onClick={refreshChoosers}>
          Refresh
        </button>
      </div>

      {neverCloseApplications.length === 0 ? (
        <p className={styles.emptyHint}>No protected apps yet.</p>
      ) : (
        <div className={styles.list}>
          {neverCloseApplications.map((app) => (
            <div key={app.id} className={styles.row}>
              <img className={styles.rowIcon} src={app.icon} alt="" />
              <span className={styles.rowLabel}>{app.name}</span>
              <button
                className={styles.removeBtn}
                title="Remove from never-close"
                onClick={() => unprotectApplication(app)}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <h4 className={styles.subHeading}>Currently open applications</h4>
      {openApplications.length === 0 ? (
        <p className={styles.emptyHint}>
          No other open apps detected. Make sure the app has a window in focus,
          then press Refresh.
        </p>
      ) : (
        <div className={styles.list}>
          {openApplications.map((app) => (
            <div
              key={app.id}
              className={`${styles.row} ${styles.rowClickable}`}
              title="Mark as never-close"
              onClick={() => protectApplication(app)}
            >
              <img className={styles.rowIcon} src={app.icon} alt="" />
              <span className={styles.rowLabel}>{app.name}</span>
              <span className={styles.addHint}>+ protect</span>
            </div>
          ))}
        </div>
      )}

      <div className={styles.sectionHeader}>
        <div className={styles.titleWithInfo}>
          <h4>Browser tabs that should never close</h4>
          <InfoIcon
            className={styles.infoIcon}
            data-tooltip-id={'task-snap'}
            data-tooltip-html={
              'These tabs stay open when you switch tasks. Requires the browser extension to be connected.'
            }
          />
        </div>
      </div>

      {!extensionStatus.isBrowserConnected ? (
        <p className={styles.emptyHint}>
          Connect the browser extension to manage tabs.
        </p>
      ) : (
        <>
          {neverCloseTabs.length === 0 ? (
            <p className={styles.emptyHint}>No protected tabs yet.</p>
          ) : (
            <div className={styles.list}>
              {neverCloseTabs.map((tab) => (
                <div key={tab.id} className={styles.row}>
                  {tab.favIconUrl ? (
                    <img className={styles.rowIcon} src={tab.favIconUrl} alt="" />
                  ) : (
                    <span className={styles.rowIconFallback} />
                  )}
                  <span className={styles.rowLabel}>{tab.title || tab.url}</span>
                  <button
                    className={styles.removeBtn}
                    title="Remove from never-close"
                    onClick={() => unprotectTab(tab)}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          <h4 className={styles.subHeading}>Currently open tabs</h4>
          {openBrowserTabs.length === 0 ? (
            <p className={styles.emptyHint}>
              No open tabs detected. Press Refresh after opening a tab.
            </p>
          ) : (
            <div className={styles.list}>
              {openBrowserTabs.map((tab) => (
                <div
                  key={tab.url}
                  className={`${styles.row} ${styles.rowClickable}`}
                  title="Mark as never-close"
                  onClick={() => protectTab(tab)}
                >
                  {tab.favIconUrl ? (
                    <img className={styles.rowIcon} src={tab.favIconUrl} alt="" />
                  ) : (
                    <span className={styles.rowIconFallback} />
                  )}
                  <span className={styles.rowLabel}>{tab.title || tab.url}</span>
                  <span className={styles.addHint}>+ protect</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {showInstructions && (
        <StudyInstructions onClose={() => setShowInstructions(false)} />
      )}
    </div>
  );
}
