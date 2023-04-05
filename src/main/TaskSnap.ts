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

/**
 * Main class of the application
 */
export default class TaskSnap {
  private static _instance: TaskSnap;
  private _windowTracker: WindowTracker;
  private _fileSystemWatcher: FileSystemWatcher;
  private _snapshotManager: SnapshotManager;

  private constructor() {
    this._windowTracker = new WindowTracker();
    this._fileSystemWatcher = new FileSystemWatcher();
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

    const openApplications = await this.getCurrentlyOpenApplications();
    await Application.save(openApplications);

    const nextId = await Snapshot.getNextId();
    const newSnapshot = new Snapshot();
    newSnapshot.created = new Date().toISOString();
    newSnapshot.name = `Snapshot ${nextId}`;
    newSnapshot.applications = openApplications;
    await Snapshot.save(newSnapshot);

    WindowManager.createInstantCurationWindow();
  }

  public async applyLatestSnapshot() {
    const latestSnapshot = await this._snapshotManager.getLatestSnapshot();
    if (!latestSnapshot) return;

    for (const app of latestSnapshot.applications) {
      // If files are present, don't open application but files associated with application
      if (app.files.length > 0) {
        for (const file of app.files) {
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

  // TODO [regloff] refactor this method
  public async getCurrentlyOpenApplications(): Promise<Application[]> {
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

    const openApplications: Application[] = [];
    for await (const win of openWindows) {
      const app = new Application();
      app.name = win.owner.name;
      app.path = win.owner.path;
      openApplications.push(app);

      if (isMac) {
        const associatedFiles: File[] = [];
        const processInfoOfApplication = processInfos.filter((process) => {
          return process.process.pid === win.owner.processId;
        });
        const filePaths = processInfoOfApplication[0].files.map((f) => f.name);
        for await (const path of filePaths) {
          if (path) {
            const fileName = getFileNameFromPath(path)
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

    return openApplications;
  }
}
