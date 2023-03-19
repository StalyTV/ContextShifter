/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, March 2023
 */

import { exec } from 'child_process';
import { info } from 'electron-log';
import WindowTracker from './WindowTracker';
import { ipcMain } from 'electron';
import Log from './entity/Log';
import ActiveWindow from './entity/ActiveWindow';

/**
 * Main class of the application
 */
export default class TaskSnap {
  private static _instance: TaskSnap;
  private _windowTracker: WindowTracker;

  private constructor() {
    this._windowTracker = new WindowTracker();
  }

  public static getInstance() {
    return this._instance || (this._instance = new this());
  }

  public start() {
    info('[TaskSnap] Started');

    this._windowTracker.start();
  }

  public openApplication(process: string) {
    exec(`open -a '${process}'`);
  }
}

// TODO: Move this to API
ipcMain.on('get-used-applications', async (event, arg) => {
  const lastStart = await Log.getLastApplicationStart();
  const applications = await ActiveWindow.getUsedApplications(lastStart);
  event.reply('get-used-applications', applications);
});

ipcMain.on('open-application', async (event, arg) => {
  TaskSnap.getInstance().openApplication(arg[0]);
});
