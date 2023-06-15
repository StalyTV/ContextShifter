/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, March 2023
 */

import { app, dialog } from 'electron';
import { info } from 'electron-log';
import WindowTracker from './trackers/WindowTracker';
import FileSystemWatcher from './trackers/FileSystemWatcher';
import TrayManager from './TrayManager';
import activeWin from 'active-win';
import Snapshot from './entity/Snapshot';
import Application from './entity/Application';
import File from './entity/File';
import IDE from './entity/IDE';
import IDEFileEntity from './entity/IDEFile';
import WindowManager from './WindowManager';
import SnapshotManager from './SnapshotManager';
import { lsof, Options, ProcessInfo } from 'list-open-files';
import Artifact from 'types/Artifact';
import {
  getOpenFileExplorerPaths,
  getRecentlyOpenedFilePaths,
  openArtifact,
} from './helpers/osCommands';
import { getFileNameFromPath } from './helpers/getFileNameFromPath';
import isMac from './helpers/isMac';
import BrowserTracker from './trackers/BrowserTracker';
import BrowserTabEntity from './entity/BrowserTab';
import { CloseTabClientRequest } from '../types/context-browser-extension-types/types';
import Browser from './entity/Browser';
import VSCodeTracker from './trackers/VSCodeTracker';
import getAssetPath from './helpers/getAssetPath';
import ExtensionsStatus from '../types/ExtensionsStatus';
import UsageData from './entity/UsageData';
import DeviceManager from './HID/DeviceManager';
import KnownApplication from './entity/KnownApplication';
import { TypedWebContents } from './ipc/types/electron-typed-ipc';
import Events from '../types/Events';
import { BrowserType } from '../types/BrowserType';
import { UsageDataOrigin } from '../types/UsageDataOrigin';
import Exporter from './Exporter';
import FDACalculator from './FDACalculator';
import SummaryProvider from './SummaryProvider';
import StaticSettings from './StaticSettings';
import ActiveWindow from './entity/ActiveWindow';
import ActiveArtifact from './trackers/ActiveArtifact';
const fileIcon = require('extract-file-icon');
const soundPlayer = require('sound-play');

interface TaskSnapWindowObject {
  title: string;
  application: string;
  applicationPath: string;
  processId: number;
}

/**
 * Main class of the application
 */
export default class TaskSnap {
  private static _instance: TaskSnap;
  private _windowTracker: WindowTracker;
  private _browserTracker: BrowserTracker;
  private _fileSystemWatcher: FileSystemWatcher;
  private _vscodeTracker: VSCodeTracker;
  private _deviceManager: DeviceManager;
  private _snapshotManager: SnapshotManager;
  private _cameraShutterSoundPath = getAssetPath(`sounds/cameraShutter.mp3`);

  private constructor() {
    this._windowTracker = new WindowTracker();
    this._browserTracker = BrowserTracker.getInstance();
    this._fileSystemWatcher = new FileSystemWatcher();
    this._vscodeTracker = new VSCodeTracker();
    this._deviceManager = DeviceManager.getInstance();
    this._snapshotManager = SnapshotManager.getInstance();
  }

  public static getInstance() {
    return this._instance || (this._instance = new this());
  }

  public start() {
    info('[TaskSnap] Started');
    TrayManager.init(this);
    this.startTrackers();
    Exporter.startBackupLoop();
  }

  public async stop() {
    info('[TaskSnap] Stopped');
    await this.stopTrackers();
  }

  public startTrackers() {
    info('[TaskSnap] Started Trackers');
    this._windowTracker.start();
    this._fileSystemWatcher.start();
    ActiveArtifact.startIdleCheck();
  }

  public async stopTrackers() {
    info('[TaskSnap] Stopped Trackers');
    await this._windowTracker.stop();
    this._fileSystemWatcher.stop();
    await ActiveArtifact.storeAll();
    await ActiveArtifact.stopIdleCheck();
  }

  public async createNewSnapshot(origin: UsageDataOrigin) {
    info('[TaskSnap] New snapshot created');
    soundPlayer.play(this._cameraShutterSoundPath);
    this._deviceManager.showLightPulse();

    // store currently open active window to be sure that it is included in snapshot
    await ActiveArtifact.storeCurrentWindow();

    // immediately create snapshot and open instant curation view, later add open applications and files to snapshot.
    const timestamp = new Date().toISOString();
    const nextId = await Snapshot.getNextId();
    const newSnapshot = new Snapshot();
    newSnapshot.created = timestamp;
    newSnapshot.lastChange = timestamp;
    newSnapshot.name = `Snapshot ${nextId}`;
    await Snapshot.save(newSnapshot);

    await WindowManager.createInstantCurationWindow();
    await UsageData.addEntry(
      'create-snapshot',
      false,
      `id: ${newSnapshot.id}, origin: ${origin}`
    );

    const res = await this.getCurrentlyOpenApplications();
    const openBrowsers = res[0];
    const openIDEs = res[1];
    const openApplications = res[2];

    // when no artifacts to attach, show error message
    if (
      openBrowsers.length === 0 &&
      openIDEs.length === 0 &&
      openApplications.length === 0
    ) {
      dialog.showMessageBox({
        message: 'No open windows to attach to a snapshot',
        type: 'error',
      });
      newSnapshot.isReady = true;
      await newSnapshot.save();
      return;
    }

    await Browser.save(openBrowsers);
    await IDE.save(openIDEs);
    await Application.save(openApplications);

    const summary = await SummaryProvider.createTaskSummary();

    newSnapshot.browsers = openBrowsers;
    newSnapshot.ides = openIDEs;
    newSnapshot.applications = openApplications;
    newSnapshot.summary = summary;
    newSnapshot.isReady = true;
    await newSnapshot.save();

    // latest tabs are already stored in memory. Save them to db.
    if (openBrowsers.length > 0) {
      this._browserTracker.saveOpenTabsToDb(openBrowsers);
    }

    // same for vscode
    if (openIDEs.length > 0) {
      this._vscodeTracker.sendGetVSCodeSnapshotRequest();
    }

    // notify windows that snapshot is ready
    this.notifyWindows(newSnapshot.id);

    // update snapshot gallery window
    this._snapshotManager.updateSnapshotGalleryWindow();

    // update tray menu
    await TrayManager.updateTray();
  }

  private notifyWindows(snapshotId: number): void {
    if (WindowManager.instantCurationWindow) {
      const destination = WindowManager.instantCurationWindow
        .webContents as TypedWebContents<Events>;
      destination?.send('snapshot-ready', snapshotId);
    }
    if (WindowManager.snapshotWindow) {
      const destination = WindowManager.snapshotWindow
        .webContents as TypedWebContents<Events>;
      destination?.send('snapshot-ready', snapshotId);
    }
  }

  public async restoreSnapshot(snapshot: Snapshot, origin: UsageDataOrigin) {
    info(`[TaskSnap] Restore snapshot "${snapshot.name}"`);
    // the snapshot given as parameter might not be from the db, but coming from the renderer process
    // therefore, quickly load it here to update the timestamp
    const dbEntry = await this._snapshotManager.getSnapshotById(snapshot.id);
    if (dbEntry) {
      dbEntry.lastRestore = new Date().toISOString();
      await dbEntry.save();
    }

    await UsageData.addEntry(
      'restore-snapshot',
      false,
      `id: ${snapshot.id}, origin: ${origin}`
    );

    // if summary or intent available, create window that visualizes summary and intent of snapshot
    if (snapshot.summary || snapshot.intent) {
      if (!WindowManager.mentalContextWindow) {
        await WindowManager.createMentalContextWindow(() => {
          const destination = WindowManager.mentalContextWindow
            ?.webContents as TypedWebContents<Events>;
          destination?.send('snapshot-selected', snapshot.id);
          this.restoreWorkingContext(snapshot);
        });
      } else {
        WindowManager.mentalContextWindow.show();
        const destination = WindowManager.mentalContextWindow
          .webContents as TypedWebContents<Events>;
        destination?.send('snapshot-selected', snapshot.id);
        this.restoreWorkingContext(snapshot);
      }
    }
  }
  private restoreWorkingContext(snapshot: Snapshot) {
    for (const browser of snapshot.browsers) {
      if (!browser.isSelected) continue;

      const urlsToOpen: string[] = [];
      browser.browserTabs.forEach((tab) => {
        if (tab.isSelected) {
          urlsToOpen.push(tab.url);
        }
      });
      this.openBrowserTabs(browser, urlsToOpen, snapshot.name);
    }

    for (const ide of snapshot.ides) {
      if (!ide.isSelected) continue;

      const filesToOpen: string[] = [];
      ide.ideFiles.forEach((file) => {
        if (file.isSelected) {
          filesToOpen.push(file.path);
        }
      });
      this.openIDEFiles(ide, filesToOpen);
    }

    for (const app of snapshot.applications) {
      if (!app.isSelected) continue;

      // If selected files are present, don't open application but files associated with application
      const selectedFiles = app.files.filter((file) => file.isSelected);
      if (selectedFiles.length > 0) {
        for (const file of selectedFiles) {
          const artifact: Artifact = {
            artifact: file.path,
            application: app.path,
          };
          openArtifact(artifact);
        }
      } else {
        const artifact: Artifact = {
          artifact: app.path,
        };
        openArtifact(artifact);
      }
    }
  }

  public openBrowserTabs(
    browser: Browser,
    urlsToOpen: string[],
    label?: string
  ): void {
    // open browser
    const artifact: Artifact = {
      artifact: browser.path,
    };
    openArtifact(artifact);

    // if websocket is not open, wait until browser is ready (sends any kind of message)
    if (this._browserTracker.isSocketOpen()) {
      this._browserTracker.sendTabOpeningRequest(
        browser.type,
        urlsToOpen,
        label
      );
    } else {
      this._browserTracker.subscribeToConnection(browser.type, () => {
        this._browserTracker.sendTabOpeningRequest(
          browser.type,
          urlsToOpen,
          label
        );
      });
    }
  }

  public openIDEFiles(ide: IDE, filePaths: string[]) {
    // open ide. If workspace is defined, open workspace
    const artifact: Artifact = {
      artifact: ide.workspacePath ? ide.workspacePath : ide.path,
    };
    openArtifact(artifact);

    // if websocket is not open, wait until ide is ready (sends any kind of message)
    if (this._vscodeTracker.isSocketOpen()) {
      this._vscodeTracker.sendOpenFilesRequest(filePaths);
    } else {
      this._vscodeTracker.subscribeToConnection(() => {
        this._vscodeTracker.sendOpenFilesRequest(filePaths);
      });
    }
  }

  public closeBrowserTabs(
    browser: Browser,
    tabsToClose: BrowserTabEntity[]
  ): void {
    const closeRequest: CloseTabClientRequest[] = tabsToClose.map((tab) => {
      return { url: tab.url };
    });
    this._browserTracker.sendTabClosingRequest(browser.type, closeRequest);
  }

  public closeIDEFiles(filesToClose: IDEFileEntity[]): void {
    const filePaths: string[] = filesToClose.map((file) => {
      return file.path;
    });
    this._vscodeTracker.sendFileClosingRequest(filePaths);
  }

  // TODO [regloff] refactor this method
  public async getCurrentlyOpenApplications(): Promise<
    [Browser[], IDE[], Application[]]
  > {
    const visibleWindows = await activeWin.getOpenWindows();

    // map results from activeWin to own window object
    const windowsToConsider: TaskSnapWindowObject[] = visibleWindows.map(
      (win) => {
        return {
          title: win.title,
          application: win.owner.name,
          applicationPath: win.owner.path,
          processId: win.owner.processId,
        };
      }
    );
    //
    // In addition, consider all applications used in the last 15 minutes.
    // Like this, we also get apps that are recently closed, minimized, or in full screen (mac).
    const tsStart = new Date(
      Date.now() - StaticSettings.RECENTLY_OPEN_APPS_TIME_WINDOW
    );
    const recentlyActiveWindows = await ActiveWindow.getRecentlyActiveWindows(
      tsStart
    );
    recentlyActiveWindows.forEach((recentWin) => {
      const isAlreadyInList = visibleWindows.some((visibleWin) => {
        return visibleWin.owner.name === recentWin.application;
      });
      if (!isAlreadyInList) {
        const winObject: TaskSnapWindowObject = {
          title: recentWin.title,
          application: recentWin.application,
          applicationPath: recentWin.applicationPath,
          processId: recentWin.processId,
        };
        windowsToConsider.push(winObject);
      }
    });

    if (!windowsToConsider) {
      return [[], [], []];
    }
    const pidsOfApplications: number[] = visibleWindows.map((win) => {
      return win.owner.processId;
    });
    const options: Options = {
      pids: pidsOfApplications,
    };

    let processInfos: ProcessInfo[] = [];
    let recentlyOpenedFiles: string[] = [];
    if (isMac) {
      processInfos = await lsof(options);
    } else {
      const searchStart = new Date(new Date().setHours(0));
      recentlyOpenedFiles = await getRecentlyOpenedFilePaths(searchStart);
    }

    // calculate relevance for smart pre-selection
    const appNamesOfOpenWindows: string[] = [];
    windowsToConsider.forEach((win) => {
      const appName = win.application;
      if (!appNamesOfOpenWindows.includes(appName)) {
        appNamesOfOpenWindows.push(appName);
      }
    });
    const relevances = await FDACalculator.getRelevanceOfApplications(
      appNamesOfOpenWindows
    );
    let loggingString = ''; // Somehow logging a map does not work
    relevances.forEach((value, key) => {
      loggingString += `([${key}] ${value}),`;
    });
    info('[TaskSnap] Relevances:', loggingString);
    const relevantApps: string[] = [];
    relevances.forEach((val, appName) => {
      if (val > 1) {
        // TODO: Make this more sophisticated
        relevantApps.push(appName);
      }
    });

    const openBrowsers: Browser[] = [];
    const openIDEs: IDE[] = [];
    const openApplications: Application[] = [];
    for await (const win of windowsToConsider) {
      const appName = win.application;
      const appPath = win.applicationPath;
      if (appName === app.getName() || appName === 'Electron') continue;

      const isAppRelevantForTask = relevantApps.includes(appName);

      // browsers get stored separately, as handling of urls different than handling of files
      if (
        appName.includes('Google Chrome') ||
        appName.includes('Firefox') ||
        appName.includes('Edge')
      ) {
        let browserType: BrowserType;
        if (appName.includes('Edge')) {
          browserType = 'edge';
        } else if (appName.includes('Firefox')) {
          browserType = 'firefox';
        } else {
          browserType = 'chrome';
        }

        const browser = new Browser();
        browser.name = appName;
        browser.type = browserType;
        browser.path = appPath;
        browser.icon = this.getApplicationIcon(appPath);
        browser.title = win.title;
        browser.isSelected = isAppRelevantForTask;
        browser.relevance = relevances.get(appName) || 0;
        openBrowsers.push(browser);

        // ide
      } else if (
        appName === 'Code' ||
        appName === 'Visual Studio Code' ||
        appName === 'Visual Studio Code.app'
      ) {
        const ide = new IDE();
        ide.name = appName;
        ide.path = appPath;
        ide.icon = this.getApplicationIcon(appPath);
        ide.title = win.title;
        ide.isSelected = isAppRelevantForTask;
        ide.relevance = relevances.get(appName) || 0;
        openIDEs.push(ide);

        // file explorer
      } else if (appName === 'Finder' || appName === 'Windows Explorer') {
        // only add file explorer once
        if (
          openApplications.some(
            (app) => app.name === 'Finder' || app.name === 'Windows Explorer'
          )
        ) {
          continue;
        }

        const app = new Application();
        app.name = appName;
        app.path = appPath;
        app.icon = this.getApplicationIcon(appPath);
        app.title = 'File System';
        app.isSelected = isAppRelevantForTask;
        app.relevance = relevances.get(appName) || 0;
        openApplications.push(app);

        const associatedFolders: File[] = [];
        const folderPaths = await getOpenFileExplorerPaths();
        folderPaths.forEach((path) => {
          const file = new File();
          file.path = path;
          file.name = getFileNameFromPath(path);
          file.isSelected = isAppRelevantForTask; // TODO: Improve this
          associatedFolders.push(file);
        });
        if (associatedFolders.length > 0) {
          await File.save(associatedFolders);
        }
        app.files = associatedFolders;

        // regular application case
      } else {
        let app: Application;
        // check if this application was already added -> just append file
        const alreadyAddedApplication = openApplications.find(
          (app) => app.name === appName
        );

        if (alreadyAddedApplication) {
          app = alreadyAddedApplication;
          app.title = appName; // use app name as multiple windows have multiple titles
        } else {
          app = new Application();
          app.name = appName;
          app.path = appPath;
          app.icon = this.getApplicationIcon(appPath);
          app.title = win.title;
          app.isSelected = isAppRelevantForTask;
          openApplications.push(app);
        }

        const associatedFiles: File[] = alreadyAddedApplication
          ? alreadyAddedApplication.files
          : [];

        if (StaticSettings.shouldAppHaveFiles(appName)) {
          if (isMac) {
            const processInfoOfApplication = processInfos.filter((process) => {
              return process.process.pid === win.processId;
            });
            if (processInfoOfApplication.length > 0) {
              let filePaths = processInfoOfApplication[0].files.map(
                (f) => f.name
              );

              // Apple Preview stores associated files differently
              if (appName === 'Preview') {
                filePaths = processInfoOfApplication[0].texts.map(
                  (f) => f.name
                );
              }
              for await (const path of filePaths) {
                // Remove paths that are simply "/"
                if (path && path.length > 1) {
                  const fileName = getFileNameFromPath(path, true);
                  const lowerCaseFileName = fileName.toLowerCase();
                  if (
                    (lowerCaseFileName.includes(win.title.toLowerCase()) ||
                      win.title.toLowerCase().includes(lowerCaseFileName)) &&
                    !lowerCaseFileName.includes('~$')
                  ) {
                    // check that file not already included
                    if (associatedFiles.some((file) => file.path === path)) {
                      continue;
                    }

                    const file = new File();
                    file.path = path;
                    file.name = getFileNameFromPath(path);
                    file.isSelected = isAppRelevantForTask; // TODO: Improve this
                    associatedFiles.push(file);
                  }
                }
              }
              if (associatedFiles.length > 0) {
                await File.save(associatedFiles);
              }
              app.files = associatedFiles;
            }

            // Windows case
          } else {
            for await (const path of recentlyOpenedFiles) {
              const fileName = getFileNameFromPath(path, true);
              const lowerCaseFileName = fileName.toLowerCase();
              if (
                lowerCaseFileName.includes(win.title.toLowerCase()) ||
                win.title.toLowerCase().includes(lowerCaseFileName)
              ) {
                const file = new File();
                file.path = path;
                file.name = getFileNameFromPath(path);
                file.isSelected = isAppRelevantForTask; // TODO: Improve this
                associatedFiles.push(file);
              }
            }
            if (associatedFiles.length > 0) {
              await File.save(associatedFiles);
            }
            app.files = associatedFiles;
          }
        }
      }
    }

    return [openBrowsers, openIDEs, openApplications];
  }

  public getApplicationIcon(path: string): string {
    const iconBuffer = fileIcon(path, 16);
    const iconString = Buffer.from(iconBuffer).toString('base64');
    const dataUrl = `data:image/png;base64,${iconString}`;
    return dataUrl;
  }

  public getExtensionsStatus(): ExtensionsStatus {
    const status: ExtensionsStatus = {
      isVSCodeConnected: this._vscodeTracker.isSocketOpen(),
      isBrowserConnected: this._browserTracker.isSocketOpen(),
    };
    return status;
  }

  public async getKnownApplications(): Promise<KnownApplication[]> {
    // first update list of known applications based on currently open windows
    const openWindows = await activeWin.getOpenWindows();

    const alreadyKnownApplications = await KnownApplication.find();
    const appsToAdd: KnownApplication[] = [];

    openWindows.forEach((win) => {
      const appPath = win.owner.path;
      const appName = win.owner.name;
      const isAlreadyAdded = alreadyKnownApplications.some((knownApp) => {
        return knownApp.path === appPath;
      });

      // multiple windows of the same application can be open
      const isDuplicate = appsToAdd.some((appInList) => {
        return appInList.path === appPath;
      });

      if (
        !isAlreadyAdded &&
        !isDuplicate &&
        appName !== app.getName() &&
        appName !== 'Electron' &&
        appName !== 'Finder' && // closing the file system entirely leads to issues. Therefore, don't give the user this option
        appName !== 'Windows Explorer'
      ) {
        const newKnownApp = new KnownApplication();
        newKnownApp.name = appName;
        newKnownApp.path = appPath;
        newKnownApp.icon = this.getApplicationIcon(appPath);
        appsToAdd.push(newKnownApp);
      }
    });
    await KnownApplication.save(appsToAdd);

    return await KnownApplication.find();
  }

  public async updateKnownApplication(app: KnownApplication): Promise<void> {
    info(`[TaskSnap] Updated known application with id ${app.id}`);
    const knownAppInDb = await KnownApplication.findOneBy({ id: app.id });
    if (knownAppInDb) {
      knownAppInDb.neverClose = app.neverClose;
      knownAppInDb.save();
      UsageData.addEntry(
        'update-known-application',
        false,
        JSON.stringify(app)
      );
    }
  }
}
