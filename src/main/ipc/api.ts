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

typedIpcMain.handle('get-used-applications', async () => {
  const lastStart = await Log.getLastApplicationStart();
  const applications = await ActiveWindow.getUsedApplications(lastStart);
  return applications;
});

typedIpcMain.handle('open-artifact', async (e, artifact) => {
  openArtifact(artifact);
});

typedIpcMain.handle('get-latest-snapshot', async () => {
  return await SnapshotManager.getInstance().getLatestSnapshot();
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

typedIpcMain.handle(
  'postpone-snapshot',
  async (e, snapshotId, timeInMin) => {
    await SnapshotManager.getInstance().postponeSnapshot(snapshotId, timeInMin);
  }
);

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
    WindowManager.createSnapshotWindow();
  }
);
