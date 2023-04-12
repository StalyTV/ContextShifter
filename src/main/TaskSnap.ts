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
import WindowManager from './WindowManager';
import SnapshotManager from './SnapshotManager';
import { lsof, Options, ProcessInfo } from 'list-open-files';
import Artifact from 'types/Artifact';
import { openArtifact } from './helpers/osCommands';
import { getFileNameFromPath } from './helpers/getFileNameFromPath';
import isMac from './helpers/isMac';
import BrowserTracker from './trackers/BrowserTracker';
import BrowserTabEntity from './entity/BrowserTab';
import { CloseTabClientRequest } from 'context-browser-extension-types';
import Browser from './entity/Browser';
import VSCodeTracker from './trackers/VSCodeTracker';

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
    const openApplications = res[1];

    await Browser.save(openBrowsers);
    await Application.save(openApplications);

    const nextId = await Snapshot.getNextId();
    const newSnapshot = new Snapshot();
    newSnapshot.created = new Date().toISOString();
    newSnapshot.name = `Snapshot ${nextId}`;
    newSnapshot.browsers = openBrowsers;
    newSnapshot.applications = openApplications;
    await Snapshot.save(newSnapshot);

    // send request to get information from the browser. Information will later be attached to the snapshot.
    this._browserTracker.sendGetAllTabsRequest();

    WindowManager.createInstantCurationWindow();
  }

  public async applyLatestSnapshot() {
    const latestSnapshot = await this._snapshotManager.getLatestSnapshot();
    if (!latestSnapshot) return;

    for (const browser of latestSnapshot.browsers) {
      if (!browser.isSelected) continue;

      const urlsToOpen: string[] = [];
      browser.browserTabs.forEach((tab) => {
        if (tab.isSelected) {
          urlsToOpen.push(tab.url);
        }
      });
      this._browserTracker.sendTabOpeningRequest(
        urlsToOpen,
        latestSnapshot.name
      );
    }

    for (const app of latestSnapshot.applications) {
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
    [Browser[], Application[]]
  > {
    const openWindows = await activeWin.getOpenWindows();
    const pidsOfApplications: number[] = openWindows.map((win) => {
      return win.owner.processId;
    });
    const options: Options = {
      pids: pidsOfApplications,
    };

    let processInfos: ProcessInfo[] = [];
    if (isMac) {
      processInfos = await lsof(options);
    } else {
      processInfos = [];
    }

    const openBrowsers: Browser[] = [];
    const openApplications: Application[] = [];
    for await (const win of openWindows) {
      const appName = win.owner.name;
      const appPath = win.owner.path;
      // browsers get stored separately, as handling of urls different than handling of files
      if (
        appName.includes('Google Chrome') ||
        appName.includes('Firefox') ||
        appName.includes('Edge') // TODO: Check if this name is correct
      ) {
        const browser = new Browser();
        browser.name = appName;
        browser.path = appPath;
        openBrowsers.push(browser);

        // regular application case
      } else {
        const app = new Application();
        app.name = appName;
        app.path = appPath;
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
              const fileName = getFileNameFromPath(path);
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
        }
      }
    }

    return [openBrowsers, openApplications];
  }
}
