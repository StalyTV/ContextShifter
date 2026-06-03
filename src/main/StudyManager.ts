/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, June 2023
 */

import { StudyPhase } from '../types/StudyPhase';
import { Database } from './database';
import Log from './entity/Log';
import UsageData from './entity/UsageData';
import { info, error } from 'electron-log';
import isMac from './helpers/isMac';
import { app, powerMonitor } from 'electron';
import path from 'path';
import fs from 'fs';
import {
  getOpenFileExplorerPaths,
  sampleOpenApplications,
} from './helpers/osCommands';
import StaticSettings from './StaticSettings';
import AnalysisOpenApplications from './entity/AnalysisOpenApplications';
import AnalysisOpenBrowserTabs from './entity/AnalysisOpenBrowserTabs';
import AnalysisOpenIDEFiles from './entity/AnalysisOpenIDEFiles';
import BrowserTracker from './trackers/BrowserTracker';
import VSCodeTracker from './trackers/VSCodeTracker';
import AnalysisOpenFileSystemTabs from './entity/AnalysisOpenFileSystemTabs';
import { hashString } from './helpers/hashString';

export default class StudyManager {
  private static _currentStudyPhase: StudyPhase = StudyPhase.NoStudy;
  private static _openArtifactsLoopRef: NodeJS.Timeout | undefined;

  public static async init() {
    const tempPath = isMac
      ? `Library/Logs/${app.name}/study_config.txt`
      : `AppData/Roaming/${app.name}/logs/study_config.txt`;
    const configPath = path.join(app.getPath('home'), tempPath);

    try {
      // create file for new users
      const wasStartedOnce = await Log.wasApplicationStartedOnce();
      if (!wasStartedOnce) {
        fs.writeFileSync(configPath, 'baseline');
      }

      // only set study settings if config file exists
      if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, {
          encoding: 'utf8',
          flag: 'r',
        });

        if (content.toLowerCase() === 'baseline') {
          this._currentStudyPhase = StudyPhase.Baseline;
        } else if (content.toLowerCase() === 'intervention') {
          this._currentStudyPhase = StudyPhase.Intervention;
        } else {
          this._currentStudyPhase = StudyPhase.Intervention; // default in case of misspelling
        }
        UsageData.addEntry(
          'active-study-phase',
          true,
          `${this._currentStudyPhase}`
        );
      }
    } catch (err) {
      console.error(err);
    }

    // hide dock icon during first study phase
    if (isMac && this._currentStudyPhase === StudyPhase.Baseline) {
      app.dock.hide();
    }
    info(`[StudyManager] Current study phase: ${this._currentStudyPhase}`);
  }

  public static getStudyPhase(): StudyPhase {
    return this._currentStudyPhase;
  }

  public static async startOpenArtifactsSampling(): Promise<void> {
    if (this._currentStudyPhase === StudyPhase.NoStudy) {
      info(
        `[StudyManager] Not in study mode. Don't start sampling of open applications`
      );
      return;
    }
    info('[StudyManager] Started sampling of open applications');

    const loop = async () => {
      const timestamp = new Date().toISOString();
      const isIdle =
        powerMonitor.getSystemIdleTime() > StaticSettings.IDLE_TIMEOUT;

      // applications
      const dbEntryApps = new AnalysisOpenApplications();
      dbEntryApps.ts = timestamp;
      dbEntryApps.isIdle = isIdle;
      try {
        const openApps = await sampleOpenApplications();
        dbEntryApps.additionalInformation = JSON.stringify(openApps);
      } catch (err) {
        error(
          '[StudyManager] An error occurred while sampling open applications',
          err
        );
        dbEntryApps.additionalInformation =
          'error while sampling open applications';
      }
      await dbEntryApps.save();

      // browser tabs
      const dbEntryBrowserTabs = new AnalysisOpenBrowserTabs();
      dbEntryBrowserTabs.ts = timestamp;
      dbEntryBrowserTabs.isIdle = isIdle;
      const openTabs = BrowserTracker.getInstance().getOpenTabsForAnalysis();
      dbEntryBrowserTabs.additionalInformation = JSON.stringify(openTabs);
      await dbEntryBrowserTabs.save();

      // IDE files
      const dbEntryIDEFiles = new AnalysisOpenIDEFiles();
      dbEntryIDEFiles.ts = timestamp;
      dbEntryIDEFiles.isIdle = isIdle;
      const openFiles = VSCodeTracker.getInstance().getOpenFilesForAnalysis();
      dbEntryIDEFiles.additionalInformation = JSON.stringify(openFiles);
      await dbEntryIDEFiles.save();

      // file system tabs
      const dbEntryFileSystemTabs = new AnalysisOpenFileSystemTabs();
      dbEntryFileSystemTabs.ts = timestamp;
      dbEntryFileSystemTabs.isIdle = isIdle;
      try {
        const folderPaths = await getOpenFileExplorerPaths();
        const hashedPaths = folderPaths.map((path) => {
          return hashString(path);
        });
        dbEntryFileSystemTabs.additionalInformation =
          JSON.stringify(hashedPaths);
      } catch (err) {
        error(
          '[StudyManager] An error occurred while sampling open file system tabs',
          err
        );
        dbEntryApps.additionalInformation =
          'error while sampling open file system tabs';
      }
      await dbEntryFileSystemTabs.save();
    };

    await loop();
    this._openArtifactsLoopRef = setInterval(
      loop,
      StaticSettings.OPEN_ARTIFACTS_SAMPLING_RATE
    );
  }

  public static async stopOpenArtifactsSampling() {
    clearInterval(this._openArtifactsLoopRef);
  }
}
