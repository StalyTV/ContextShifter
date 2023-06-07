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
import isMac from './helpers/isMac';
import TrayManager from './TrayManager';
import UsageData from './entity/UsageData';

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

    this.snapshotWindow.loadURL(resolveHtmlPath('index.html'));
    await UsageData.addEntry('open-snapshot-window');

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

    this.snapshotWindow.webContents.once('did-finish-load', () => {
      this.snapshotWindow?.setMenuBarVisibility(false);
    });

    this.snapshotWindow.on('closed', async () => {
      this.snapshotWindow = null;
      await UsageData.addEntry('close-snapshot-window');
    });

    this.snapshotWindow.webContents.once('dom-ready', onDomReady);

    this.snapshotWindow.on('minimize', async () => {
      await UsageData.addEntry('minimize-snapshot-window');
    });
    this.snapshotWindow.on('restore', async () => {
      await UsageData.addEntry('restore-snapshot-window');
    });
    this.snapshotWindow.on('focus', async () => {
      await UsageData.addEntry('focus-snapshot-window');
    });
    this.snapshotWindow.on('blur', async () => {
      await UsageData.addEntry('blur-snapshot-window');
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
      width: 590,
      height: 160,
      minimizable: false,
      maximizable: false,
      alwaysOnTop: true,
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

    this.instantCurationWindow.loadURL(
      resolveHtmlPath('index.html') + `#/instantCuration`
    );
    await UsageData.addEntry('open-instant-curation-window');

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

    this.instantCurationWindow.webContents.once('did-finish-load', () => {
      this.instantCurationWindow?.setMenuBarVisibility(false);
    });

    this.instantCurationWindow.on('closed', async () => {
      this.instantCurationWindow = null;
      await UsageData.addEntry('close-instant-curation-window');
    });

    this.instantCurationWindow.on('minimize', async () => {
      await UsageData.addEntry('minimize-instant-curation-window');
    });
    this.instantCurationWindow.on('restore', async () => {
      await UsageData.addEntry('restore-instant-curation-window');
    });
    this.instantCurationWindow.on('focus', async () => {
      await UsageData.addEntry('focus-instant-curation-window');
    });
    this.instantCurationWindow.on('blur', async () => {
      await UsageData.addEntry('blur-instant-curation-window');
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

    this.snapshotGalleryWindow.loadURL(
      resolveHtmlPath('index.html') + `#/snapshotGallery`
    );
    await UsageData.addEntry('open-snapshot-gallery-window');

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

    this.snapshotGalleryWindow.webContents.once('did-finish-load', () => {
      this.snapshotGalleryWindow?.setMenuBarVisibility(false);
    });

    this.snapshotGalleryWindow.on('closed', async () => {
      this.snapshotGalleryWindow = null;
      await UsageData.addEntry('close-snapshot-gallery-window');
    });

    this.snapshotGalleryWindow.on('minimize', async () => {
      await UsageData.addEntry('minimize-snapshot-gallery-window');
    });
    this.snapshotGalleryWindow.on('restore', async () => {
      await UsageData.addEntry('restore-snapshot-gallery-window');
    });
    this.snapshotGalleryWindow.on('focus', async () => {
      await UsageData.addEntry('focus-snapshot-gallery-window');
    });
    this.snapshotGalleryWindow.on('blur', async () => {
      await UsageData.addEntry('blur-snapshot-gallery-window');
    });

    const menuBuilder = new MenuBuilder(this.snapshotGalleryWindow);
    menuBuilder.buildMenu();
  }
}
