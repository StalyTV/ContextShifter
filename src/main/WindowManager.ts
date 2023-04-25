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
import ElectronPositioner from 'electron-positioner';
import path from 'path';
import isWindows from './helpers/isWindows';
import isMac from './helpers/isMac';
import TrayManager from './TrayManager';

export default class WindowManager {
  public static snapshotWindow: BrowserWindow | null = null;
  public static instantCurationWindow: BrowserWindow | null = null;
  public static snapshotGalleryWindow: BrowserWindow | null = null;

  public static async createSnapshotWindow(onDomReady: () => void = () => {}) {
    if (this.snapshotWindow) return;

    this.snapshotWindow = new BrowserWindow({
      show: false,
      width: 1024,
      height: 800,
      icon: getAssetPath('icon.png'),
      title: 'Curate Snapshot',
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

    this.snapshotWindow.webContents.once('dom-ready', onDomReady);

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
      height: 210,
      icon: getAssetPath('icon.png'),
      title: 'New Snapshot',
      webPreferences: {
        preload: app.isPackaged
          ? path.join(__dirname, 'preload.js')
          : path.join(__dirname, '../../.erb/dll/preload.js'),
      },
    });

    const positioner = new ElectronPositioner(this.instantCurationWindow);
    if (isMac) {
      const trayBounds = TrayManager.getBounds();
      if (trayBounds) {
        positioner.move('trayCenter', trayBounds);
      }
    } else {
      positioner.move('bottomRight');
    }

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

  public static async createSnapshotGalleryWindow() {
    if (this.snapshotGalleryWindow) return;

    this.snapshotGalleryWindow = new BrowserWindow({
      show: false,
      width: 1024,
      height: 800,
      icon: getAssetPath('icon.png'),
      title: 'Snapshot Gallery',
      webPreferences: {
        preload: app.isPackaged
          ? path.join(__dirname, 'preload.js')
          : path.join(__dirname, '../../.erb/dll/preload.js'),
      },
    });

    if (isWindows) {
      this.snapshotGalleryWindow.removeMenu();
    }

    this.snapshotGalleryWindow.loadURL(
      resolveHtmlPath('index.html') + `#/snapshotGallery`
    );

    this.snapshotGalleryWindow.on('ready-to-show', () => {
      if (!this.snapshotGalleryWindow) {
        throw new Error('"snapshotGalleryWindow" is not defined');
      }
      if (process.env.START_MINIMIZED) {
        this.snapshotGalleryWindow.minimize();
      } else {
        this.snapshotGalleryWindow.show();
      }
    });

    this.snapshotGalleryWindow.on('closed', () => {
      this.snapshotGalleryWindow = null;
    });

    const menuBuilder = new MenuBuilder(this.snapshotGalleryWindow);
    menuBuilder.buildMenu();
  }
}
