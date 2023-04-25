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
import WindowManager from './WindowManager';
import SnapshotManager from './SnapshotManager';
import { lsof, Options, ProcessInfo } from 'list-open-files';
import Artifact from 'types/Artifact';
import { getRecentlyOpenedFilePaths, openArtifact } from './helpers/osCommands';
import { getFileNameFromPath } from './helpers/getFileNameFromPath';
import isMac from './helpers/isMac';
import BrowserTracker from './trackers/BrowserTracker';
import BrowserTabEntity from './entity/BrowserTab';
import { CloseTabClientRequest } from 'context-browser-extension-types';
import Browser from './entity/Browser';
import VSCodeTracker from './trackers/VSCodeTracker';
import { excludedApplications } from './config';
const fileIcon = require('extract-file-icon');

/**
 * Main class of the application
 */
export default class TaskSnap {
  private static _instance: TaskSnap;
  private _windowTracker: WindowTracker;
  private _browserTracker: BrowserTracker;
  private _fileSystemWatcher: FileSystemWatcher;
  private _vscodeTracker: VSCodeTracker;
  private _snapshotManager: SnapshotManager;

  private constructor() {
    this._windowTracker = new WindowTracker();
    this._browserTracker = new BrowserTracker();
    this._fileSystemWatcher = new FileSystemWatcher();
    this._vscodeTracker = new VSCodeTracker();
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

  public async createNewSnapshot() {
    info('[TaskSnap] New snapshot created');

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

    // send request to get information from the browser. Information will later be attached to the snapshot.
    this._browserTracker.sendGetAllTabsRequest();

    // same for vscode
    this._vscodeTracker.sendGetVSCodeSnapshotRequest();

    WindowManager.createInstantCurationWindow();
  }

  public async applyLatestSnapshot() {
    const latestSnapshot = await this._snapshotManager.getLatestSnapshot();
    if (!latestSnapshot) return;

    await this.applySnapshot(latestSnapshot);
  }

  public async applySnapshot(snapshot: Snapshot) {
    for (const browser of snapshot.browsers) {
      if (!browser.isSelected) continue;

      const urlsToOpen: string[] = [];
      browser.browserTabs.forEach((tab) => {
        if (tab.isSelected) {
          urlsToOpen.push(tab.url);
        }
      });
      this._browserTracker.sendTabOpeningRequest(urlsToOpen, snapshot.name);
    }

    for (const ide of snapshot.ides) {
      if (!ide.isSelected) continue;

      const filesToOpen: string[] = [];
      ide.ideFiles.forEach((file) => {
        if (file.isSelected) {
          filesToOpen.push(file.path);
        }
      });
      this._vscodeTracker.sendOpenFilesRequest(filesToOpen);
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

  public closeBrowserTabs(tabsToClose: BrowserTabEntity[]): void {
    const closeRequest: CloseTabClientRequest[] = tabsToClose.map((tab) => {
      return { url: tab.url };
    });
    this._browserTracker.sendTabClosingRequest(closeRequest);
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

      if (excludedApplications.includes(appName)) continue;

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
                const file = new File();
                file.path = path;
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
}
