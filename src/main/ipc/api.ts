/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, March 2023
 */

import typedIpcMain from './typedIpcMain';
import Log from '../entity/Log';
import ActiveWindow from '../entity/ActiveWindow';
import SnapshotManager from '../SnapshotManager';
import { nativeTheme } from 'electron';
import { openArtifact } from '../helpers/osCommands';
import WindowManager from '../WindowManager';
import SnapshotEntity from '../entity/Snapshot';
import TaskSnap from '../TaskSnap';

typedIpcMain.handle('get-used-applications', async () => {
  const lastStart = await Log.getLastApplicationStart();
  const applications = await ActiveWindow.getUsedApplications(lastStart);
  return applications;
});

typedIpcMain.handle('open-artifact', async (e, artifact) => {
  openArtifact(artifact);
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
  await SnapshotManager.getInstance().saveSnapshot(snapshot);
});

typedIpcMain.handle(
  'save-snapshot-and-close-applications',
  async (e, snapshot) => {
    await SnapshotManager.getInstance().saveAndCloseApplications(snapshot);
  }
);

typedIpcMain.handle('delete-snapshot', async (e, snapshotId) => {
  await SnapshotManager.getInstance().deleteSnapshot(snapshotId);
});

typedIpcMain.handle('postpone-snapshot', async (e, snapshot, timeInMin) => {
  await SnapshotManager.getInstance().saveSnapshot(snapshot);
  await SnapshotManager.getInstance().postponeSnapshot(snapshot.id, timeInMin);
  WindowManager.snapshotWindow?.close();
});

typedIpcMain.handle('toggle-color-theme', () => {
  if (nativeTheme.shouldUseDarkColors) {
    nativeTheme.themeSource = 'light';
  } else {
    nativeTheme.themeSource = 'dark';
  }
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
    await SnapshotManager.getInstance().postponeSnapshot(snapshotId, timeInMin);
    WindowManager.instantCurationWindow?.close();
  }
);

// snapshot gallery
typedIpcMain.handle('open-snapshot', async (e, snapshotId) => {
  SnapshotManager.getInstance().openSnapshotInSnapshotWindow(snapshotId);
});

typedIpcMain.handle('apply-snapshot', async (e, snapshotId) => {
  const snapshot = await SnapshotEntity.getSnapshotById(snapshotId);
  if (snapshot) {
    await TaskSnap.getInstance().applySnapshot(snapshot);
  }
});

typedIpcMain.handle('open-browser-tab', async (e, browser, browserTab) => {
  TaskSnap.getInstance().openBrowserTabs(browser, [browserTab.url]);
});

typedIpcMain.handle('open-ide-file', async (e, ide, file) => {
  TaskSnap.getInstance().openIDEFiles(ide, [file.path]);
});

// settings
typedIpcMain.handle('get-extensions-status', async () => {
  return TaskSnap.getInstance().getExtensionsStatus();
});
