/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, March 2023
 */

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
import { getRecentlyOpenedFilePaths, openArtifact } from './helpers/osCommands';
import { getFileNameFromPath } from './helpers/getFileNameFromPath';
import isMac from './helpers/isMac';
import BrowserTracker from './trackers/BrowserTracker';
import BrowserTabEntity from './entity/BrowserTab';
import { CloseTabClientRequest } from '../types/context-browser-extension-types/types';
import Browser from './entity/Browser';
import VSCodeTracker from './trackers/VSCodeTracker';
import AppConfig from './AppConfig';
import getAssetPath from './helpers/getAssetPath';
import ExtensionsStatus from '../types/ExtensionsStatus';
import UsageData from './entity/UsageData';
import DeviceManager from './HID/DeviceManager';
import KnownApplication from './entity/KnownApplication';
const fileIcon = require('extract-file-icon');
const sound = require('sound-play');

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
    this._browserTracker = new BrowserTracker();
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

    this._windowTracker.start();
    this._fileSystemWatcher.start();
  }

  public stop() {
    info('[TaskSnap] Stopped');

    this._windowTracker.stop();
    this._fileSystemWatcher.stop();
  }

  public async createNewSnapshot(origin: string) {
    info('[TaskSnap] New snapshot created');
    sound.play(this._cameraShutterSoundPath);
    this._deviceManager.showLightPulse();

    const res = await this.getCurrentlyOpenApplications();
    const openBrowsers = res[0];
    const openIDEs = res[1];
    const openApplications = res[2];

    await Browser.save(openBrowsers);
    await IDE.save(openIDEs);
    await Application.save(openApplications);

    const nextId = await Snapshot.getNextId();
    const newSnapshot = new Snapshot();
    newSnapshot.created = new Date().toISOString();
    newSnapshot.name = `Snapshot ${nextId}`;
    newSnapshot.browsers = openBrowsers;
    newSnapshot.ides = openIDEs;
    newSnapshot.applications = openApplications;
    await Snapshot.save(newSnapshot);
    await UsageData.addEntry(
      'create-snapshot',
      false,
      `id: ${newSnapshot.id}, origin: ${origin}`
    );

    // latest tabs are already stored in memory. Save them to db.
    if (openBrowsers.length > 0) {
      this._browserTracker.saveOpenTabsToDb(openBrowsers[0]); // TODO: improve this
    }

    // same for vscode
    if (openIDEs.length > 0) {
      this._vscodeTracker.sendGetVSCodeSnapshotRequest();
    }

    WindowManager.createInstantCurationWindow();

    // update snapshot gallery window
    this._snapshotManager.updateSnapshotGalleryWindow();
  }

  public async restoreLatestSnapshot() {
    const latestSnapshot = await this._snapshotManager.getLatestSnapshot();
    if (!latestSnapshot) return;

    await this.restoreSnapshot(latestSnapshot, 'tray');
  }

  public async restoreSnapshot(snapshot: Snapshot, origin: string) {
    info(`[TaskSnap] Restore snapshot "${snapshot.name}"`);
    await UsageData.addEntry(
      'restore-snapshot',
      false,
      `id: ${snapshot.id}, origin: ${origin}`
    );

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
      this._browserTracker.sendTabOpeningRequest(urlsToOpen, label);
    } else {
      this._browserTracker.subscribeToConnection(() => {
        this._browserTracker.sendTabOpeningRequest(urlsToOpen, label);
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

  public closeBrowserTabs(tabsToClose: BrowserTabEntity[]): void {
    const closeRequest: CloseTabClientRequest[] = tabsToClose.map((tab) => {
      return { url: tab.url };
    });
    this._browserTracker.sendTabClosingRequest(closeRequest);
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
    const openWindows = await activeWin.getOpenWindows();
    const pidsOfApplications: number[] = openWindows.map((win) => {
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

    const openBrowsers: Browser[] = [];
    const openIDEs: IDE[] = [];
    const openApplications: Application[] = [];
    for await (const win of openWindows) {
      const appName = win.owner.name;
      const appPath = win.owner.path;

      if (AppConfig.getExcludedApplications().includes(appName)) continue;

      // browsers get stored separately, as handling of urls different than handling of files
      if (
        appName.includes('Google Chrome') ||
        appName.includes('Firefox') ||
        appName.includes('Edge') // TODO: Check if this name is correct
      ) {
        const browser = new Browser();
        browser.name = appName;
        browser.path = appPath;
        browser.icon = this.getApplicationIcon(appPath);
        browser.title = win.title;
        openBrowsers.push(browser);

        // ide
      } else if (appName === 'Code') {
        const ide = new IDE();
        ide.name = appName;
        ide.path = appPath;
        ide.icon = this.getApplicationIcon(appPath);
        ide.title = win.title;
        openIDEs.push(ide);

        // regular application case
      } else {
        const app = new Application();
        app.name = appName;
        app.path = appPath;
        app.icon = this.getApplicationIcon(appPath);
        app.title = win.title;
        openApplications.push(app);

        if (isMac) {
          const associatedFiles: File[] = [];
          const processInfoOfApplication = processInfos.filter((process) => {
            return process.process.pid === win.owner.processId;
          });
          const filePaths = processInfoOfApplication[0].files.map(
            (f) => f.name
          );
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

          // Windows case
        } else {
          const associatedFiles: File[] = [];
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

      if (!isAlreadyAdded && !isDuplicate) {
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
