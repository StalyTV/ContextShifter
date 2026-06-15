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
      title: 'ContextShifter',
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

  // Width/height of the switcher overlay; shared by create + reposition.
  private static readonly SWITCHER_WIDTH = 420;
  private static readonly SWITCHER_HEIGHT = 152;

  /**
   * Float the overlay above everything, make it appear on whatever Desktop/
   * Space is active (incl. other apps' full-screen Spaces), and park it in the
   * top-right of the display the cursor is on. macOS quietly drops these
   * collection-behavior settings, so we re-assert them on every show.
   *
   * NOTE: re-running setVisibleOnAllWorkspaces re-runs a process-type transform,
   * which is the documented price of cross-Space visibility here. It can briefly
   * drop the Dock icon. We accept that trade-off (per user preference) because
   * showing on the active Desktop matters more. We deliberately do NOT call
   * app.dock.show() in this hot path — doing so spawned duplicate Dock tiles.
   */
  private static applySwitcherOverlayBehavior() {
    const win = this.taskSwitcherWindow;
    if (!win) return;
    const { screen } = require('electron');
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true,
    });
    try {
      const point = screen.getCursorScreenPoint();
      const display = screen.getDisplayNearestPoint(point);
      const { x, y, width: sw } = display.workArea;
      win.setPosition(x + sw - this.SWITCHER_WIDTH - 20, y + 20);
    } catch {
      /* best-effort positioning */
    }
  }

  public static async createTaskSwitcherWindow() {
    if (this.taskSwitcherWindow) {
      // Reuse: re-assert all-Spaces behavior + reposition onto the active
      // display, then show.
      this.applySwitcherOverlayBehavior();
      this.taskSwitcherWindow.showInactive();
      setTimeout(() => this.applySwitcherOverlayBehavior(), 50);
      return;
    }

    const width = this.SWITCHER_WIDTH;
    const height = this.SWITCHER_HEIGHT;

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

    // Float over fullscreen apps, show on every Space, position on active display.
    this.applySwitcherOverlayBehavior();

    // Force the dock icon back on once at creation (the transform can hide it).
    if (process.platform === 'darwin' && app.dock) {
      app.dock.show();
    }

    this.taskSwitcherWindow.loadURL(
      resolveHtmlPath('index.html') + `#/taskSwitcher`
    );

    this.taskSwitcherWindow.once('ready-to-show', () => {
      this.applySwitcherOverlayBehavior();
      this.taskSwitcherWindow?.showInactive();
      setTimeout(() => this.applySwitcherOverlayBehavior(), 50);
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
