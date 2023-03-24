/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, March 2023
 */

import { exec } from 'child_process';
import { info } from 'electron-log';
import WindowTracker from './trackers/WindowTracker';
import FileSystemWatcher from './trackers/FileSystemWatcher';
import isMac from './helpers/isMac';
import TrayManager from './TrayManager';

/**
 * Main class of the application
 */
export default class TaskSnap {
  private static _instance: TaskSnap;
  private _windowTracker: WindowTracker;
  private _fileSystemWatcher: FileSystemWatcher;

  private constructor() {
    this._windowTracker = new WindowTracker();
    this._fileSystemWatcher = new FileSystemWatcher();
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

  public createNewSnapshot() {
    info('[TaskSnap] New snapshot created');
  }

  public openApplication(process: string) {
    if (isMac) {
      exec(`open -a '${process}'`);
    } else {
      exec(`start ${process}`);
    }
  }
}
