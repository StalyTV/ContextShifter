/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, March 2023
 */

import { app } from "electron";
import { info } from "electron-log";
import WindowTracker from "./trackers/WindowTracker";
import FileSystemWatcher from "./trackers/FileSystemWatcher";
import TrayManager from "./TrayManager";
import activeWin from "active-win";
import Application from "./entity/Application";
import File from "./entity/File";
import IDE from "./entity/IDE";
import IDEFileEntity from "./entity/IDEFile";
import UsageData from "./entity/UsageData";
import { lsof, Options, ProcessInfo } from "list-open-files";
import {
  getOpenFileExplorerPaths,
  getRecentlyOpenedFilePaths,
} from './helpers/osCommands';
import { getFileNameFromPath } from "./helpers/getFileNameFromPath";
import isMac from "./helpers/isMac";
import BrowserTracker from "./trackers/BrowserTracker";
import Browser from "./entity/Browser";
import VSCodeTracker from "./trackers/VSCodeTracker";
import ExtensionsStatus from "../types/ExtensionsStatus";
import DeviceManager from "./HID/DeviceManager";
import TimeBuzzerManager from "./HID/TimeBuzzerManager";
import KnownApplication from "./entity/KnownApplication";
import StaticSettings from "./StaticSettings";
import ActiveWindow from "./entity/ActiveWindow";
import ActiveArtifact from "./trackers/ActiveArtifact";
import Exporter from "./Exporter";
import StudyManager from "./StudyManager";

const fileIcon = require('extract-file-icon');

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
  private _timeBuzzerManager: TimeBuzzerManager;

  private constructor() {
    this._windowTracker = new WindowTracker();
    this._browserTracker = BrowserTracker.getInstance();
    this._fileSystemWatcher = new FileSystemWatcher();
    this._vscodeTracker = VSCodeTracker.getInstance();
    this._deviceManager = DeviceManager.getInstance();
    this._timeBuzzerManager = TimeBuzzerManager.getInstance();
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
    StudyManager.startOpenArtifactsSampling();
  }

  public async stopTrackers() {
    info('[TaskSnap] Stopped Trackers');
    await this._windowTracker.stop();
    this._fileSystemWatcher.stop();
    await ActiveArtifact.storeAll();
    await ActiveArtifact.stopIdleCheck();
    Exporter.stopBackupLoop();
    StudyManager.stopOpenArtifactsSampling();
  }

  public async getCurrentlyOpenApplications(): Promise<
    [Browser[], IDE[], Application[]]> {
    const t0 = Date.now();
    info('[TaskSnap] getCurrentlyOpenApplications: start');
    // active-win occasionally hangs or exits non-zero on macOS (Screen
    // Recording permission, sandbox quirks, transient process state).
    // Race it against a timeout and fall back to recently-active windows
    // from the DB so the dialog is never blocked.
    let visibleWindows: activeWin.Result[] = [];
    try {
      visibleWindows = await Promise.race([
        activeWin.getOpenWindows().then((w) => w || []),
        new Promise<activeWin.Result[]>((_resolve, reject) =>
          setTimeout(() => reject(new Error('active-win timeout')), 5000)
        ),
      ]);
      info(
        `[TaskSnap] getCurrentlyOpenApplications: activeWin (${Date.now() - t0}ms, ${visibleWindows.length} windows)`
      );
    } catch (err) {
      info(
        `[TaskSnap] getCurrentlyOpenApplications: activeWin failed (${Date.now() - t0}ms): ${String(err)}`
      );
      visibleWindows = [];
    }

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
      // `list-open-files` invokes the system `lsof` command. It can hang for
      // many seconds (or indefinitely) when one of the pids is in a weird
      // state — e.g. a process that died moments after we sampled it, or a
      // sandboxed app. Race it against a timeout so the UI never deadlocks;
      // we'd rather miss a few file associations than freeze the dialog.
      const lsofStart = Date.now();
      info(`[TaskSnap] getCurrentlyOpenApplications: lsof start (${pidsOfApplications.length} pids)`);
      try {
        processInfos = await Promise.race([
          lsof(options),
          new Promise<ProcessInfo[]>((_resolve, reject) =>
            setTimeout(() => reject(new Error('lsof timeout')), 8000)
          ),
        ]);
        info(`[TaskSnap] getCurrentlyOpenApplications: lsof done (${Date.now() - lsofStart}ms, ${processInfos.length} infos)`);
      } catch (err) {
        info(`[TaskSnap] getCurrentlyOpenApplications: lsof failed/timed out (${Date.now() - lsofStart}ms): ${String(err)}`);
        processInfos = [];
      }
    } else {
      const searchStart = new Date(new Date().setHours(0));
      recentlyOpenedFiles = await getRecentlyOpenedFilePaths(searchStart);
    }

    const [browsers, ides, fileExplorers, regularApps] = this.sortWindowsByType(windowsToConsider);


    const openBrowsers: Browser[] = await this.handleBrowsers(browsers);
    info(`[TaskSnap] getCurrentlyOpenApplications: handled browsers (${openBrowsers.length})`);
    const openIDEs: IDE[] = [] = await this.handleIdes(ides);
    info(`[TaskSnap] getCurrentlyOpenApplications: handled IDEs (${openIDEs.length})`);
    let openApplications: Application[] = await this.handleFileExplorer(fileExplorers);
    const otherApplications: Application[] = await this.handleRegularApplications(regularApps, processInfos, recentlyOpenedFiles);
    openApplications = openApplications.concat(otherApplications);
    info(`[TaskSnap] getCurrentlyOpenApplications: handled apps (${openApplications.length})`);

    // Filter out applications/IDEs the user marked as "never close" — these
    // are treated as ignored by the tracker (not included in new tasks).
    const ignored = await KnownApplication.getAppsThatShouldNeverBeClosed();
    const ignoredNames = new Set(ignored.map((a) => a.name));
    const filteredIDEs = openIDEs.filter((i) => !ignoredNames.has(i.name));
    const filteredApps = openApplications.filter(
      (a) => !ignoredNames.has(a.name)
    );

    info(`[TaskSnap] getCurrentlyOpenApplications: done in ${Date.now() - t0}ms`);
    return [openBrowsers, filteredIDEs, filteredApps];
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

  private mapActiveWinToTaskSnapWindows(activeWindows?: activeWin.Result[], recentWindows?: ActiveWindow[]) {
    const taskSnapWindows: TaskSnapWindowObject[] = [];
    if (activeWindows) {
      activeWindows.forEach((win) => {
        const taskSnapWindowObject: TaskSnapWindowObject = {
          title: win.title,
          application: win.owner.name,
          applicationPath: win.owner.path,
          processId: win.owner.processId,
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
    for (const win of windows) {
      const ide = new IDE();
      ide.name = win.application;
      ide.path = win.applicationPath;
      ide.icon = this.getApplicationIcon(ide.path);
      ide.title = win.title;
      // Persist the IDE shell so it has an id; the snapshot link and any
      // ideFiles are added later by SnapshotManager.createTask once the
      // user has chosen which to include.
      await ide.save();
      ide.ideFiles = [];
      openIDEs.push(ide);
    }

    // If we have a VS Code window and a live extension connection, fetch the
    // current workspace + open files now so the picker can show them. The
    // call resolves to null on timeout or when no extension is attached.
    const vscodeIde = openIDEs.find((i) =>
      i.name.toLowerCase().includes('code')
    );
    if (vscodeIde) {
      const snap = await this._vscodeTracker.requestVSCodeSnapshot();
      if (snap) {
        if (snap.branch) vscodeIde.branch = snap.branch;
        if (snap.lastCommit?.message)
          vscodeIde.lastCommitMessage = snap.lastCommit.message;
        if (snap.workspaceName) vscodeIde.workspaceName = snap.workspaceName;
        if (snap.workspacePath) vscodeIde.workspacePath = snap.workspacePath;
        await vscodeIde.save();

        // Materialise IDEFile entities in-memory (not yet linked to a
        // snapshot — that happens in SnapshotManager.createTask).
        vscodeIde.ideFiles = (snap.openFiles ?? []).map((f) => {
          const file = new IDEFileEntity();
          file.name = f.name;
          file.path = f.path;
          file.isActive = !!f.isActive;
          return file;
        });
      }
    }

    return openIDEs;
  }

  private async handleFileExplorer(windows: TaskSnapWindowObject[]) {
    const openApplications: Application[] = [];

    for (const win of windows) {
      // only add file explorer once
      if (
        openApplications.some(
          (app) => app.name.includes('Finder') || app.name.includes('Windows Explorer') || app.name.includes('Windows-Explorer')
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
        if(file.name == ""){
          file.name = file.path
        }
        associatedFolders.push(file);
      });
      if (associatedFolders.length > 0) {
        await File.save(associatedFolders);
      }
      app.files = associatedFolders;

      //save app
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
    }else{
      //fix bug if application quit too quickly for browser tracker
      chromeBrowsers = []
    }

    if (filteredBrowsers.firefox[0] != null) {
      if(firefoxBrowsers){
          firefoxBrowsers.forEach((browser) => {
            browser.path = filteredBrowsers.firefox[0].applicationPath;
            browser.icon = this.getApplicationIcon(filteredBrowsers.firefox[0].applicationPath);
            browser.title = filteredBrowsers.firefox[0].title;
            browser.name = filteredBrowsers.firefox[0].application;
          });
      }
    }else{
      //fix bug if application quit too quickly for browser tracker
      firefoxBrowsers = []
    }

    if (filteredBrowsers.edge[0] != null) {
      edgeBrowsers?.forEach((browser) => {
        browser.path = filteredBrowsers.edge[0].applicationPath;
        browser.icon = this.getApplicationIcon(filteredBrowsers.edge[0].applicationPath);
        browser.title = filteredBrowsers.edge[0].title;
        browser.name = filteredBrowsers.edge[0].application;
      });
    }else{
      //fix bug if application quit too quickly for browser tracker
      edgeBrowsers = []
    }

    if (filteredBrowsers.safari[0] != null) {
      safariBrowsers?.forEach((browser) => {
        browser.path = filteredBrowsers.safari[0].applicationPath;
        browser.icon = this.getApplicationIcon(filteredBrowsers.safari[0].applicationPath);
        browser.title = filteredBrowsers.safari[0].title;
        browser.name = filteredBrowsers.safari[0].application;
      });
    }else{
      //fix bug if application quit too quickly for browser tracker
      safariBrowsers = []
    }
    return (chromeBrowsers ?? []).concat(firefoxBrowsers ?? [], edgeBrowsers ?? [], safariBrowsers ?? []);

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
            for await (let path of filePaths) {
              // Remove paths that are simply "/"
              if (path && path.length > 1) {
                //Special characters are escaped which leads to issues when comparing paths. This function reverts the escaping.
                path = decodeURIComponent(path.replace(/\\x/g, '%'));

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
          for await (let path of recentlyOpenedFiles) {
            //Special characters are escaped which leads to issues when comparing paths. This function reverts the escaping.
            path = decodeURIComponent(path.replace(/\\x/g, '%'));
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
      if ((appName.includes('Google Chrome') || appName.includes('Firefox') || appName.includes('Edge') || appName.includes('Safari')) && this._browserTracker.isActiveBrowserAddon(appName)) {
        browserWindows.push(win);
      } else if (
        appName === 'Code' ||
        appName === 'Visual Studio Code' ||
        appName === 'Visual Studio Code.app'
      ) {
        ideFiles.push(win);
      } else if (appName.includes('Finder') || appName.includes('Windows Explorer') || appName.includes('Windows-Explorer')) {
        fileExplorer.push(win);
      } else {
        otherWindows.push(win);
      }
    });

    return [browserWindows, ideFiles, fileExplorer, otherWindows];
  }
}
