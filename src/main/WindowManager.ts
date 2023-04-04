/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, March 2023
 */

import { BrowserWindow, shell } from 'electron';
import MenuBuilder from './menu';
import { resolveHtmlPath } from './util';
import getAssetPath from './helpers/getAssetPath';
import { app } from 'electron';
import path from 'path';
import isWindows from './helpers/isWindows';

export default class WindowManager {
  public static snapshotWindow: BrowserWindow | null = null;
  public static instantCurationWindow: BrowserWindow | null = null;

  public static async createSnapshotWindow() {
    if (this.snapshotWindow) return;

    this.snapshotWindow = new BrowserWindow({
      show: false,
      width: 1024,
      height: 800,
      icon: getAssetPath('icon.png'),
      webPreferences: {
        preload: app.isPackaged
          ? path.join(__dirname, 'preload.js')
          : path.join(__dirname, '../../.erb/dll/preload.js'),
      },
    });

    if (isWindows) {
      this.snapshotWindow.removeMenu();
    }
    this.snapshotWindow.loadURL(resolveHtmlPath('index.html'));

    this.snapshotWindow.on('ready-to-show', () => {
      if (!this.snapshotWindow) {
        throw new Error('"snapshotWindow" is not defined');
      }
      if (process.env.START_MINIMIZED) {
        this.snapshotWindow.minimize();
      } else {
        this.snapshotWindow.show();
      }
    });

    this.snapshotWindow.on('closed', () => {
      this.snapshotWindow = null;
    });

    const menuBuilder = new MenuBuilder(this.snapshotWindow);
    menuBuilder.buildMenu();

    // Open urls in the user's browser
    this.snapshotWindow.webContents.setWindowOpenHandler((edata) => {
      shell.openExternal(edata.url);
      return { action: 'deny' };
    });
  }

  public static async createInstantCurationWindow() {
    if (this.instantCurationWindow) return;

    this.instantCurationWindow = new BrowserWindow({
      show: false,
      width: 600,
      height: 300,
      icon: getAssetPath('icon.png'),
      webPreferences: {
        preload: app.isPackaged
          ? path.join(__dirname, 'preload.js')
          : path.join(__dirname, '../../.erb/dll/preload.js'),
      },
    });

    if (isWindows) {
      this.instantCurationWindow.removeMenu();
    }

    this.instantCurationWindow.loadURL(
      resolveHtmlPath('index.html') + `#/instantCuration`
    );

    this.instantCurationWindow.on('ready-to-show', () => {
      if (!this.instantCurationWindow) {
        throw new Error('"instantCurationWindow" is not defined');
      }
      if (process.env.START_MINIMIZED) {
        this.instantCurationWindow.minimize();
      } else {
        this.instantCurationWindow.show();
      }
    });

    this.instantCurationWindow.on('closed', () => {
      this.instantCurationWindow = null;
    });

    const menuBuilder = new MenuBuilder(this.instantCurationWindow);
    menuBuilder.buildMenu();
  }
}
