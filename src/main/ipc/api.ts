/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, March 2023
 */

import typedIpcMain from './typedIpcMain';
import Log from '../entity/Log';
import ActiveWindow from '../entity/ActiveWindow';
import SnapshotManager from '../SnapshotManager';
import { app, nativeTheme, shell } from 'electron';
import { openArtifact } from '../helpers/osCommands';
import WindowManager from '../WindowManager';
import SnapshotEntity from '../entity/Snapshot';
import TaskSnap from '../TaskSnap';
import path from 'path';
import UsageData from '../entity/UsageData';
import DeviceManager from '../HID/DeviceManager';

typedIpcMain.handle('get-used-applications', async () => {
  const lastStart = await Log.getLastApplicationStart();
  const applications = await ActiveWindow.getUsedApplications(lastStart);
  return applications;
});

typedIpcMain.handle('open-artifact', async (e, artifact) => {
  await UsageData.addEntry('open-artifact', false, JSON.stringify(artifact));
  openArtifact(artifact);
});

typedIpcMain.handle('open-all-artifacts-of-snapshot', async (e, snapshot) => {
  TaskSnap.getInstance().restoreSnapshot(snapshot, 'curation_window');
});

typedIpcMain.handle('get-snapshot-by-id', async (e, id) => {
  return await SnapshotManager.getInstance().getSnapshotById(id);
});

typedIpcMain.handle('get-latest-snapshot', async () => {
  return await SnapshotManager.getInstance().getLatestSnapshot();
});

typedIpcMain.handle('get-latest-n-snapshots', async (e, n) => {
  return await SnapshotManager.getInstance().getLatestNSnapshots(n);
});

typedIpcMain.handle('save-snapshot', async (e, snapshot) => {
  await UsageData.addEntry('save-snapshot', false, `id: ${snapshot.id}`);
  await SnapshotManager.getInstance().saveSnapshot(snapshot);
});

typedIpcMain.handle(
  'save-snapshot-and-close-applications',
  async (e, snapshot) => {
    await UsageData.addEntry(
      'save-snapshot-and-close-applications',
      false,
      `id: ${snapshot.id}`
    );
    await SnapshotManager.getInstance().saveAndCloseApplications(snapshot);
  }
);

typedIpcMain.handle('postpone-snapshot', async (e, snapshot, timeInMin) => {
  await SnapshotManager.getInstance().saveSnapshot(snapshot);
  await SnapshotManager.getInstance().postponeSnapshot(
    snapshot.id,
    timeInMin,
    'snapshot-window'
  );
  WindowManager.snapshotWindow?.close();
});

typedIpcMain.handle('toggle-color-theme', () => {
  if (nativeTheme.shouldUseDarkColors) {
    nativeTheme.themeSource = 'light';
  } else {
    nativeTheme.themeSource = 'dark';
  }
});

typedIpcMain.handle('is-dark-mode-enabled', () => {
  return nativeTheme.shouldUseDarkColors;
});

// instant curation
typedIpcMain.handle(
  'instant-curation-curate-now',
  async (e, snapshotId, name) => {
    await SnapshotManager.getInstance().updateSnapshotName(snapshotId, name);
    WindowManager.instantCurationWindow?.close();
    SnapshotManager.getInstance().openSnapshotInSnapshotWindow(snapshotId);
  }
);

typedIpcMain.handle(
  'instant-curation-postpone',
  async (e, snapshotId, updatedName, timeInMin) => {
    await SnapshotManager.getInstance().updateSnapshotName(
      snapshotId,
      updatedName
    );
    await SnapshotManager.getInstance().postponeSnapshot(
      snapshotId,
      timeInMin,
      'instant-curation-window'
    );
    WindowManager.instantCurationWindow?.close();
  }
);

// snapshot gallery
typedIpcMain.handle('open-snapshot', async (e, snapshotId) => {
  await UsageData.addEntry('open-snapshot', false, `id: ${snapshotId}`);
  SnapshotManager.getInstance().openSnapshotInSnapshotWindow(snapshotId);
});

typedIpcMain.handle('delete-snapshot', async (e, snapshotId) => {
  await UsageData.addEntry('delete-snapshot', false, `id: ${snapshotId}`);
  await SnapshotManager.getInstance().deleteSnapshot(snapshotId);
});

typedIpcMain.handle('restore-snapshot', async (e, snapshotId) => {
  const snapshot = await SnapshotEntity.getSnapshotById(snapshotId);
  if (snapshot) {
    await TaskSnap.getInstance().restoreSnapshot(
      snapshot,
      'snapshot-gallery-window'
    );
  }
});

typedIpcMain.handle('expand-snapshot-preview', async (e, snapshotId) => {
  await UsageData.addEntry(
    'expand-snapshot-preview',
    false,
    `id: ${snapshotId}`
  );
});

typedIpcMain.handle('open-browser-tab', async (e, browser, browserTab) => {
  await UsageData.addEntry('open-browser-tab');
  TaskSnap.getInstance().openBrowserTabs(browser, [browserTab.url]);
});

typedIpcMain.handle('open-ide-file', async (e, ide, file) => {
  await UsageData.addEntry('open-ide-file');
  TaskSnap.getInstance().openIDEFiles(ide, [file.path]);
});

// settings
typedIpcMain.handle('get-extensions-status', async () => {
  return TaskSnap.getInstance().getExtensionsStatus();
});

typedIpcMain.handle('get-device-status', async () => {
  return DeviceManager.getInstance().isDeviceConnected();
});

typedIpcMain.handle('open-config', async () => {
  shell.showItemInFolder(
    path.join(app.getPath('appData'), app.name, 'config', 'config.yaml')
  );
});

typedIpcMain.handle('get-known-applications', async () => {
  return TaskSnap.getInstance().getKnownApplications();
});

typedIpcMain.handle('update-known-application', async (e, app) => {
  await TaskSnap.getInstance().updateKnownApplication(app);
});
