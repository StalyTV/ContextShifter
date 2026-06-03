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
import UsageData from './entity/UsageData';

export default class WindowManager {
  public static mainWindow: BrowserWindow | null = null;
  public static settingsWindow: BrowserWindow | null = null;

  public static async createMainWindow(onDomReady: () => void = () => {}) {
    if (this.mainWindow) {
      this.mainWindow.show();
      return;
    }

    this.mainWindow = new BrowserWindow({
      show: false,
      width: 880,
      height: 720,
      minWidth: 520,
      minHeight: 360,
      icon: getAssetPath('icon.png'),
      title: 'TaskSnap',
      webPreferences: {
        preload: app.isPackaged
          ? path.join(__dirname, 'preload.js')
          : path.join(__dirname, '../../.erb/dll/preload.js'),
      },
    });

    this.mainWindow.loadURL(resolveHtmlPath('index.html'));
    await UsageData.addEntry('open-snapshot-window');

    this.mainWindow.on('ready-to-show', () => {
      if (!this.mainWindow) return;
      if (process.env.START_MINIMIZED) this.mainWindow.minimize();
      else this.mainWindow.show();
    });

    this.mainWindow.webContents.once('did-finish-load', () => {
      this.mainWindow?.setMenuBarVisibility(false);
    });

    this.mainWindow.webContents.once('dom-ready', onDomReady);

    this.mainWindow.on('closed', async () => {
      this.mainWindow = null;
      await UsageData.addEntry('close-snapshot-window');
    });

    const menuBuilder = new MenuBuilder(this.mainWindow);
    menuBuilder.buildMenu();

    this.mainWindow.webContents.setWindowOpenHandler((edata) => {
      shell.openExternal(edata.url);
      return { action: 'deny' };
    });
  }

  public static async createSettingsWindow() {
    if (this.settingsWindow) return;

    this.settingsWindow = new BrowserWindow({
      show: false,
      width: 400,
      height: 700,
      minWidth: 300,
      minHeight: 500,
      icon: getAssetPath('icon.png'),
      title: 'Settings',
      webPreferences: {
        preload: app.isPackaged
          ? path.join(__dirname, 'preload.js')
          : path.join(__dirname, '../../.erb/dll/preload.js'),
      },
    });

    this.settingsWindow.loadURL(resolveHtmlPath('index.html') + `#/settings`);
    await UsageData.addEntry('open-settings-window');

    this.settingsWindow.on('ready-to-show', () => {
      if (!this.settingsWindow) {
        throw new Error('"settingsWindow" is not defined');
      }
      if (process.env.START_MINIMIZED) {
        this.settingsWindow.minimize();
      } else {
        this.settingsWindow.show();
      }
    });

    this.settingsWindow.webContents.once('did-finish-load', () => {
      this.settingsWindow?.setMenuBarVisibility(false);
    });

    this.settingsWindow.on('closed', async () => {
      this.settingsWindow = null;
      await UsageData.addEntry('close-settings-window');
    });

    this.settingsWindow.on('minimize', async () => {
      await UsageData.addEntry('minimize-settings-window');
    });
    this.settingsWindow.on('restore', async () => {
      await UsageData.addEntry('restore-settings-window');
    });
    this.settingsWindow.on('focus', async () => {
      await UsageData.addEntry('focus-settings-window');
    });
    this.settingsWindow.on('blur', async () => {
      await UsageData.addEntry('blur-settings-window');
    });

    const menuBuilder = new MenuBuilder(this.settingsWindow);
    menuBuilder.buildMenu();
  }

  // -------------------- Task switcher overlay --------------------

  public static taskSwitcherWindow: BrowserWindow | null = null;

  public static async createTaskSwitcherWindow() {
    if (this.taskSwitcherWindow) {
      this.taskSwitcherWindow.showInactive();
      return;
    }

    const width = 420;
    const height = 152;

    this.taskSwitcherWindow = new BrowserWindow({
      show: false,
      width,
      height,
      frame: false,
      transparent: true,
      hasShadow: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      focusable: false,
      alwaysOnTop: true,
      icon: getAssetPath('icon.png'),
      webPreferences: {
        preload: app.isPackaged
          ? path.join(__dirname, 'preload.js')
          : path.join(__dirname, '../../.erb/dll/preload.js'),
      },
    });

    // Position top-right of the primary display.
    const { screen } = require('electron');
    const display = screen.getPrimaryDisplay();
    const { x, y, width: sw } = display.workArea;
    this.taskSwitcherWindow.setPosition(x + sw - width - 20, y + 20);

    // Show on top of fullscreen apps and on every space (macOS).
    this.taskSwitcherWindow.setAlwaysOnTop(true, 'screen-saver');
    this.taskSwitcherWindow.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true,
    });

    this.taskSwitcherWindow.loadURL(
      resolveHtmlPath('index.html') + `#/taskSwitcher`
    );

    this.taskSwitcherWindow.once('ready-to-show', () => {
      this.taskSwitcherWindow?.showInactive();
    });

    this.taskSwitcherWindow.on('closed', () => {
      this.taskSwitcherWindow = null;
    });
  }

  public static closeTaskSwitcherWindow() {
    if (this.taskSwitcherWindow) {
      try {
        this.taskSwitcherWindow.close();
      } catch {
        /* ignore */
      }
      this.taskSwitcherWindow = null;
    }
  }

}
