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
  playWavSoundWindows
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
import { UsageDataOrigin } from '../types/UsageDataOrigin';
import Exporter from './Exporter';
import FDACalculator from './FDACalculator';
import SummaryProvider from './SummaryProvider';
import StaticSettings from './StaticSettings';
import ActiveWindow from './entity/ActiveWindow';
import ActiveArtifact from './trackers/ActiveArtifact';
import StudyManager from './StudyManager';
import { StudyPhase } from '../types/StudyPhase';

const fileIcon = require('extract-file-icon');
const soundPlayer = require('sound-play');

interface TaskSnapWindowObject {
  title: string;
  application: string;
  applicationPath: string;
  processId: number;
}

type SupportedBrowserTypes = {
  edge: TaskSnapWindowObject[];
  chrome: TaskSnapWindowObject[];
  safari: TaskSnapWindowObject[];
  firefox: TaskSnapWindowObject[];
};

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
  private _cameraShutterSoundPathMp3 = getAssetPath(`sounds/cameraShutter.mp3`);
  private _cameraShutterSoundPathWav = getAssetPath(`sounds/cameraShutter.wav`);

  private constructor() {
    this._windowTracker = new WindowTracker();
    this._browserTracker = BrowserTracker.getInstance();
    this._fileSystemWatcher = new FileSystemWatcher();
    this._vscodeTracker = VSCodeTracker.getInstance();
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
    Exporter.startBackupLoop();
    StudyManager.startCheckTimeLoop();
    StudyManager.startOpenArtifactsSampling();
  }

  public async stopTrackers() {
    info('[TaskSnap] Stopped Trackers');
    await this._windowTracker.stop();
    this._fileSystemWatcher.stop();
    await ActiveArtifact.storeAll();
    await ActiveArtifact.stopIdleCheck();
    Exporter.stopBackupLoop();
    StudyManager.stopCheckTimeLoop();
    StudyManager.stopOpenArtifactsSampling();
  }

  public async createNewSnapshot(origin: UsageDataOrigin) {
    // disable the creation of snapshots during baseline phase
    if (StudyManager.getStudyPhase() === StudyPhase.Baseline) {
      return;
    }

    info('[TaskSnap] New snapshot created');
    if (isMac) {
      soundPlayer.play(this._cameraShutterSoundPathMp3);
    } else {
      playWavSoundWindows(this._cameraShutterSoundPathWav); // the npm library didn't work on all Windows computers
    }
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
        type: 'error'
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

    // save latest tabs to db vscode
    if (openIDEs.length > 0) {
      this._vscodeTracker.sendGetVSCodeSnapshotRequest();

      // if no IDE is connected, we can do the relevance calculation at this point.
      // otherwise it is done after the data of the IDE is received
    } else {
      FDACalculator.addRelevanceToSnapshotArtifacts(newSnapshot.id);
    }

    // notify windows that snapshot is ready
    this.notifyWindows(newSnapshot.id);

    // update snapshot gallery window
    this._snapshotManager.updateSnapshotGalleryWindow();

    // update tray menu
    await TrayManager.updateTray();
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

    // show questionnaire during study
    if (
      StudyManager.getStudyPhase() === StudyPhase.Intervention &&
      origin === UsageDataOrigin.SnapshotGalleryWindow
    ) {
      await WindowManager.createTaskResumptionWindow(() => {
        const destination = WindowManager.taskResumptionWindow
          ?.webContents as TypedWebContents<Events>;
        destination?.send('snapshot-selected', snapshot.id);
      });
    }

    // if summary or intent available, create window that visualizes summary and intent of snapshot
    if (
      origin !== UsageDataOrigin.SnapshotWindow &&
      (snapshot.summary || snapshot.intent)
    ) {
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
    } else {
      this.restoreWorkingContext(snapshot);
    }
  }

  public async storeBrowserTabsToOpen(
    browser: Browser,
    urlsToOpen: string[],
    label?: string
  ) {

    this._browserTracker.subscribeToConnection(browser.type, () => {
      this._browserTracker.tabOpeningRequest(
        urlsToOpen,
        browser.type,
        browser.windowId,
        label
      );
    });
  }

  public openIDEFiles(ide: IDE, filePaths: string[]) {
    // open ide. If workspace is defined, open workspace
    const artifact: Artifact = {
      artifact: ide.workspacePath ? ide.workspacePath : ide.path
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
      return {
        url: tab.url,
        windowId: browser.windowId
      };
    });
    this._browserTracker.sendTabClosingRequest(browser.type, closeRequest);
  }

  public closeIDEFiles(filesToClose: IDEFileEntity[]): void {
    const filePaths: string[] = filesToClose.map((file) => {
      return file.path;
    });
    this._vscodeTracker.sendFileClosingRequest(filePaths);
  }

  public async getCurrentlyOpenApplications(): Promise<
    [Browser[], IDE[], Application[]]> {
    const visibleWindows = (await activeWin.getOpenWindows()) || [];

    let windowsToConsider = this.mapActiveWinToTaskSnapWindows(visibleWindows);

    // In addition, consider all applications used in the last 12 minutes.
    // Like this, we also get apps that are recently closed, minimized, or in full screen (mac).
    const tsStart = new Date(
      Date.now() - StaticSettings.RECENTLY_OPEN_APPS_TIME_WINDOW
    );
    const recentlyActiveWindows = await ActiveWindow.getRecentlyActiveWindows(
      tsStart
    );

    const recentlyActiveTaskSnapWindows = this.mapActiveWinToTaskSnapWindows(undefined, recentlyActiveWindows);

    //add recently active windows to list
    recentlyActiveTaskSnapWindows.forEach((win) => {
      const isAlreadyInList = windowsToConsider.some((winInList) => {
        return winInList.application === win.application && winInList.processId === win.processId;
      });
      if (!isAlreadyInList) {
        windowsToConsider.push(win);
      }
    });

    //Filter out electron and application itself from snapshots
    windowsToConsider = windowsToConsider.filter((win) => {
      return !(win.application === 'Electron' || win.application === app.getName());
    });


    const pidsOfApplications: number[] = visibleWindows.map((win) => {
      return win.owner.processId;
    });
    const options: Options = {
      pids: pidsOfApplications
    };

    let processInfos: ProcessInfo[] = [];
    let recentlyOpenedFiles: string[] = [];
    if (isMac && pidsOfApplications.length > 0) {
      processInfos = await lsof(options);
    } else {
      const searchStart = new Date(new Date().setHours(0));
      recentlyOpenedFiles = await getRecentlyOpenedFilePaths(searchStart);
    }

    //TODO calulateRelevanceForPreSelection?

    const [browsers, ides, fileExplorers, regularApps] = this.sortWindowsByType(windowsToConsider);


    const openBrowsers: Browser[] = await this.handleBrowsers(browsers);
    const openIDEs: IDE[] = [] = await this.handleIdes(ides);
    let openApplications: Application[] = await this.handleFileExplorer(fileExplorers);
    const otherApplications: Application[] = await this.handleRegularApplications(regularApps, processInfos, recentlyOpenedFiles);
    openApplications = openApplications.concat(otherApplications);

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
      isBrowserConnected: this._browserTracker.isSocketOpen()
    };
    return status;
  }

  public async getKnownApplications(): Promise<KnownApplication[]> {
    // first update list of known applications based on currently open windows
    const openWindows = await activeWin.getOpenWindows();

    const alreadyKnownApplications = await KnownApplication.find();
    const appsToAdd: KnownApplication[] = [];

    for await (const win of openWindows) {
      const appPath = win.owner.path;
      const appName = win.owner.name;
      const isAlreadyAdded = alreadyKnownApplications.some((knownApp) => {
        return knownApp.path === appPath;
      });

      // some apps (e.g. Spotify) have a new path after updating the app. -> delete old entry in this case
      const outdatedApp = alreadyKnownApplications.find((knownApp) => {
        return knownApp.name === appName && knownApp.path !== appPath;
      });
      if (outdatedApp) {
        await outdatedApp.remove();
      }

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
    }
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

  private restoreWorkingContext(snapshot: Snapshot) {
    this.restoreBrowserWindows(snapshot);
    this.restoreIdeFiles(snapshot);
    this.restoreApplications(snapshot);
  }

  private restoreApplications(snapshot: Snapshot) {
    for (const app of snapshot.applications) {
      if (!app.isSelected) continue;

      // If selected files are present, don't open application but files associated with application
      const selectedFiles = app.files.filter((file) => file.isSelected);
      if (selectedFiles.length > 0) {
        for (const file of selectedFiles) {
          const artifact: Artifact = {
            artifact: file.path,
            application: app.path
          };
          openArtifact(artifact);
        }
      } else {
        const artifact: Artifact = {
          artifact: app.path
        };
        openArtifact(artifact);
      }
    }
  }

  private restoreIdeFiles(snapshot: Snapshot) {
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
  }

  private restoreBrowserWindows(snapshot: Snapshot) {
    for (const browser of snapshot.browsers) {
      if (!browser.isSelected) continue;

      const urlsToOpen: string[] = [];
      browser.browserTabs.forEach((tab) => {
        if (tab.isSelected) {
          urlsToOpen.push(tab.url);
        }
      });
      const artifact: Artifact = {
        artifact: browser.path
      };

      openArtifact(artifact);
      this.storeBrowserTabsToOpen(browser, urlsToOpen, snapshot.name);
    }
  }

  private mapActiveWinToTaskSnapWindows(activeWindows?: activeWin.Result[], recentWindows?: ActiveWindow[]) {
    const taskSnapWindows: TaskSnapWindowObject[] = [];
    if (activeWindows) {
      activeWindows.forEach((win) => {
        const taskSnapWindowObject: TaskSnapWindowObject = {
          title: win.title,
          application: win.owner.name,
          applicationPath: win.owner.path,
          processId: win.owner.processId
        };
        taskSnapWindows.push(taskSnapWindowObject);
      });
    } else if (recentWindows) {
      recentWindows.forEach((win) => {
        const taskSnapWindowObject: TaskSnapWindowObject = {
          title: win.title,
          application: win.application,
          applicationPath: win.applicationPath,
          processId: win.processId
        };
        taskSnapWindows.push(taskSnapWindowObject);
      });
    }
    return taskSnapWindows;
  }

  private async handleIdes(windows: TaskSnapWindowObject[]) {
    const openIDEs: IDE[] = [];
    windows.forEach((win) => {
      const ide = new IDE();
      ide.name = win.application;
      ide.path = win.applicationPath;
      ide.icon = this.getApplicationIcon(ide.path);
      ide.title = win.title;
      ide.save();

      openIDEs.push(ide);
    });
    return openIDEs;

  }

  private async handleFileExplorer(windows: TaskSnapWindowObject[]) {
    const openApplications: Application[] = [];

    for (const win of windows) {
      // only add file explorer once
      if (
        openApplications.some(
          (app) => app.name === 'Finder' || app.name === 'Windows Explorer'
        )
      ) {
        continue;
      }

      //create app
      const app = new Application();
      app.name = win.application;
      app.path = win.applicationPath;
      app.icon = this.getApplicationIcon(app.path);
      app.title = 'File System';

      //add associated Folders
      const associatedFolders: File[] = [];
      const folderPaths = await getOpenFileExplorerPaths();
      folderPaths.forEach((path) => {
        const file = new File();
        file.path = path;
        file.name = getFileNameFromPath(path);
        associatedFolders.push(file);
      });
      if (associatedFolders.length > 0) {
        await File.save(associatedFolders);
      }
      app.files = associatedFolders;

      //save app
      //TODO: necessary?
      app.save();
      openApplications.push(app);
    }

    return openApplications;
  }


  private async handleBrowsers(windows: TaskSnapWindowObject[]) {
    const browsersTrackerObjects = this._browserTracker.getSnapshotInformation();


    const filteredBrowsers: SupportedBrowserTypes = {
      chrome: windows.filter((win) => win.application.toLowerCase().includes('chrome')),
      firefox: windows.filter((win) => win.application.toLowerCase().includes('firefox')),
      edge: windows.filter((win) => win.application.toLowerCase().includes('edge')),
      safari: windows.filter((win) => win.application.toLowerCase().includes('safari'))
    };


    let chromeBrowsers = browsersTrackerObjects.get('chrome');
    let firefoxBrowsers = browsersTrackerObjects.get('firefox');
    let edgeBrowsers = browsersTrackerObjects.get('edge');
    let safariBrowsers = browsersTrackerObjects.get('safari');

    if (filteredBrowsers.chrome[0] != null) {
      chromeBrowsers?.forEach((browser) => {
        browser.path = filteredBrowsers.chrome[0].applicationPath;
        browser.icon = this.getApplicationIcon(filteredBrowsers.chrome[0].applicationPath);
        browser.title = filteredBrowsers.chrome[0].title;
        browser.name = filteredBrowsers.chrome[0].application;
      });
    }

    if (filteredBrowsers.firefox[0] != null) {
      firefoxBrowsers?.forEach((browser) => {
        browser.path = filteredBrowsers.firefox[0].applicationPath;
        browser.icon = this.getApplicationIcon(filteredBrowsers.firefox[0].applicationPath);
        browser.title = filteredBrowsers.firefox[0].title;
        browser.name = filteredBrowsers.firefox[0].application;
      });
    }

    if (filteredBrowsers.edge[0] != null) {
      edgeBrowsers?.forEach((browser) => {
        browser.path = filteredBrowsers.edge[0].applicationPath;
        browser.icon = this.getApplicationIcon(filteredBrowsers.edge[0].applicationPath);
        browser.title = filteredBrowsers.edge[0].title;
        browser.name = filteredBrowsers.edge[0].application;
      });
    }

    if (filteredBrowsers.safari[0] != null) {
      safariBrowsers?.forEach((browser) => {
        browser.path = filteredBrowsers.safari[0].applicationPath;
        browser.icon = this.getApplicationIcon(filteredBrowsers.safari[0].applicationPath);
        browser.title = filteredBrowsers.safari[0].title;
        browser.name = filteredBrowsers.safari[0].application;
      });
    }

    let allBrowsers = (chromeBrowsers ?? []).concat(firefoxBrowsers ?? [], edgeBrowsers ?? [], safariBrowsers ?? []);

    //don't display browser windows if they have no tabs
    allBrowsers = allBrowsers.filter((browser) => {
      return browser.browserTabs.length > 0;
    });

    return allBrowsers;


  }


  private async handleRegularApplications(windows: TaskSnapWindowObject[], processInfos: ProcessInfo[], recentlyOpenedFiles: string[]) {
    const openApplications: Application[] = [];

    for (const win of windows) {
      let app: Application;
      // check if this application was already added -> just append file
      const alreadyAddedApplication = openApplications.find(
        (app) => app.name === win.application
      );

      if (alreadyAddedApplication) {
        app = alreadyAddedApplication;
        app.title = win.application; // use app name as multiple windows have multiple titles
      } else {
        app = new Application();
        app.name = win.application;
        app.path = win.applicationPath;
        app.icon = this.getApplicationIcon(win.applicationPath);
        app.title = win.title;
        openApplications.push(app);
      }

      const associatedFiles: File[] = alreadyAddedApplication
        ? alreadyAddedApplication.files
        : [];

      if (StaticSettings.shouldAppHaveFiles(win.application)) {

        if (isMac) {
          const processInfoOfApplication = processInfos.filter((process) => {
            return process.process.pid === win.processId;
          });
          if (processInfoOfApplication.length > 0) {
            let filePaths = processInfoOfApplication[0].files.map(
              (f) => f.name
            );

            // Apple Preview stores associated files differently
            if (win.application === 'Preview') {
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

    return openApplications;

  }

  private sortWindowsByType(windows: TaskSnapWindowObject[]): [TaskSnapWindowObject[], TaskSnapWindowObject[], TaskSnapWindowObject[], TaskSnapWindowObject[]] {
    const browserWindows: TaskSnapWindowObject[] = [];
    const ideFiles: TaskSnapWindowObject[] = [];
    const fileExplorer: TaskSnapWindowObject[] = [];
    const otherWindows: TaskSnapWindowObject[] = [];

    windows.forEach((win) => {
      const appName = win.application;
      if (appName.includes('Google Chrome') || appName.includes('Firefox') || appName.includes('Edge') || appName.includes('Safari')) {
        browserWindows.push(win);
      } else if (
        appName === 'Code' ||
        appName === 'Visual Studio Code' ||
        appName === 'Visual Studio Code.app'
      ) {
        ideFiles.push(win);
      } else if (appName === 'Finder' || appName === 'Windows Explorer') {
        fileExplorer.push(win);
      } else {
        otherWindows.push(win);
      }
    });

    return [browserWindows, ideFiles, fileExplorer, otherWindows];
  }
}
