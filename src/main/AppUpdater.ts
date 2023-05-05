/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, Dario Bugmann <darionicola.bugmann@uzh.ch>, May 2023
 */

import { autoUpdater } from 'electron-updater';
import log, { info, error } from 'electron-log';
import { app, dialog } from 'electron';

export default class AppUpdater {
  private server = 'https://tasksnap-test.vercel.app';

  constructor() {
    log.transports.file.level = 'info';
    autoUpdater.logger = log;
    this.registerEventListeners();

    const url = `${this.server}/update/${process.platform}/${app.getVersion()}`;
    autoUpdater.setFeedURL(url);

    // check for updates every 30 minutes
    autoUpdater.checkForUpdates();
    setInterval(() => {
      autoUpdater.checkForUpdates();
    }, 30 * 60 * 1000);
  }

  private registerEventListeners() {
    autoUpdater.on('update-downloaded', async () => {
      info('[AppUpdater] Update downloaded');

      const dialogOpts = {
        type: 'info',
        buttons: ['Restart', 'Later'],
        title: 'Application Update',
        message: '',
        detail:
          'A new version has been downloaded. Restart the application to apply the updates.',
      };

      const returnValue = await dialog.showMessageBox(dialogOpts);
      if (returnValue.response === 0) autoUpdater.quitAndInstall();
    });

    autoUpdater.on('checking-for-update', () => {
      info('[AppUpdater] Checking for update');
    });

    autoUpdater.on('update-available', () => {
      info('[AppUpdater] There is an update available');
    });

    autoUpdater.on('update-not-available', () => {
      info('[AppUpdater] There is no update available');
    });

    autoUpdater.on('error', (message) => {
      error(
        '[AppUpdater] There was a problem updating the application',
        message
      );
    });
  }
}
