/* eslint global-require: off, no-console: off, promise/always-return: off */

/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `npm run build` or `npm run build:main`, this file is compiled to
 * `./src/main.js` using webpack. This gives us some performance wins.
 */
import './ipc/api';
import { app, globalShortcut, powerMonitor } from 'electron';
import log from "electron-log";
import { info } from 'electron-log';
import TaskSnap from './TaskSnap';
import { Database } from './database';
import Log from './entity/Log';
import WindowManager from './WindowManager';
import UsageData from './entity/UsageData';
import path from 'path';
import DeviceManager from './HID/DeviceManager';
import TimeBuzzerManager from './HID/TimeBuzzerManager';
import AppUpdater from './AppUpdater';
import Settings from './entity/Settings';
import { UsageDataOrigin } from '../types/UsageDataOrigin';
import fs from 'fs';
import Exporter from './Exporter';
import StudyManager from './StudyManager';

if (process.env.NODE_ENV === 'production') {
  const sourceMapSupport = require('source-map-support');
  sourceMapSupport.install();
}

const isDebug =
  process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

// electron-debug is intentionally not loaded — it auto-opens DevTools on every window

// set log size
log.transports.file.level = 'info';
log.transports.file.maxSize = 10485760; // 10MB

if (require("electron-squirrel-startup")) app.quit();
app.setAppUserModelId("com.squirrel.tasksnap.TaskSnap");

// auto-start (https://www.electronjs.org/docs/latest/api/app#appsetloginitemsettingssettings-macos-windows)
const appFolder = path.dirname(process.execPath);
const updateExe = path.resolve(appFolder, '..', 'Update.exe');
const exeName = path.basename(process.execPath);

if (!isDebug) {
  app.setLoginItemSettings({
    openAtLogin: true,
    path: updateExe,
    args: ['--processStart', `"${exeName}"`],
  });
}

const installExtensions = async () => {
  const installer = require('electron-devtools-installer');
  const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
  const extensions = ['REACT_DEVELOPER_TOOLS'];

  return installer
    .default(
      extensions.map((name) => installer[name]),
      forceDownload
    )
    .catch(console.log);
};

// only allow one application instance
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

/**
 * Add event listeners...
 */

app.on('window-all-closed', () => {});

app
  .whenReady()
  .then(async () => {
    if (process.platform === 'darwin' && app.dock) {
      app.dock.show();
    }
    if (isDebug) {
      await installExtensions();
    }
    app.on('activate', () => {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (WindowManager.mainWindow === null) WindowManager.createMainWindow();
      else WindowManager.mainWindow.show();
    });

    // create connection with database
    await Database.initialize();

    // if export folder does not exist, create it
    if (!fs.existsSync(Exporter._exportFolder)) {
      fs.mkdirSync(Exporter._exportFolder, { recursive: true });
    }

    await StudyManager.init();
  })
  .then(async () => {
    await UsageData.addEntry('start', true, `version ${app.getVersion()}`);

    Database.manager.save(Log, {
      key: 'lastStart',
      value: new Date().toISOString(),
    });
    const taskSnap = TaskSnap.getInstance();
    taskSnap.start();

    // open the main window on startup
    await WindowManager.createMainWindow();

    // create shortcut
    const keys = await Settings.getSnapshotShortcut();
    globalShortcut.register(keys, () =>
      taskSnap.createNewSnapshot(UsageDataOrigin.Shortcut)
    );

    if (!isDebug) {
      new AppUpdater();
    }
  })
  .catch(console.log);

app.on('before-quit', async (e) => {
  const taskSnap = TaskSnap.getInstance();
  await taskSnap.stop();
  globalShortcut.unregisterAll();
  DeviceManager.getInstance().stopMonitoring();
  TimeBuzzerManager.getInstance().stopMonitoring();
  await UsageData.addEntry('quit', true);
});

powerMonitor.on('lock-screen', async () => {
  info('[main] lock-screen');
  const taskSnap = TaskSnap.getInstance();
  await taskSnap.stopTrackers();
  await UsageData.addEntry('lock-screen', true);
});

powerMonitor.on('unlock-screen', async () => {
  info('[main] unlock-screen');
  const taskSnap = TaskSnap.getInstance();
  taskSnap.startTrackers();
  await UsageData.addEntry('unlock-screen', true);
});
