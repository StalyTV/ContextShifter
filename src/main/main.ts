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
import { app, globalShortcut } from 'electron';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import TaskSnap from './TaskSnap';
import { Database } from './database';
import Log from './entity/Log';
import WindowManager from './WindowManager';
import AppConfig from './AppConfig';

class AppUpdater {
  constructor() {
    log.transports.file.level = 'info';
    autoUpdater.logger = log;
    autoUpdater.checkForUpdatesAndNotify();
  }
}

if (process.env.NODE_ENV === 'production') {
  const sourceMapSupport = require('source-map-support');
  sourceMapSupport.install();
}

const isDebug =
  process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

if (isDebug) {
  require('electron-debug')();
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

/**
 * Add event listeners...
 */

app.on('window-all-closed', () => {
  // Respect the OSX convention of having the application in memory even
  // after all windows have been closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app
  .whenReady()
  .then(async () => {
    if (isDebug) {
      await installExtensions();
    }
    // Remove this if your app does not use auto updates
    // eslint-disable-next-line
    new AppUpdater();
    app.on('activate', () => {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (WindowManager.snapshotWindow === null)
        WindowManager.createSnapshotGalleryWindow();
    });

    // create connection with database
    await Database.initialize();

    // load config file
    await AppConfig.loadConfig();
  })
  .then(() => {
    Database.manager.save(Log, {
      key: 'lastStart',
      value: new Date().toISOString(),
    });
    const taskSnap = TaskSnap.getInstance();
    taskSnap.start();

    // create shortcut
    const keys = AppConfig.getSnapshotShortcut();
    globalShortcut.register(keys, () => taskSnap.createNewSnapshot());
  })
  .catch(console.log);

app.on('before-quit', async (e) => {
  const taskSnap = TaskSnap.getInstance();
  taskSnap.stop();
  globalShortcut.unregisterAll();
});
