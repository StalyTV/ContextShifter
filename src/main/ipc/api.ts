/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, March 2023
 */

import typedIpcMain from './typedIpcMain';
import Log from '../entity/Log';
import ActiveWindow from '../entity/ActiveWindow';
import TaskSnap from '../TaskSnap';
import SnapshotManager from '../SnapshotManager';

typedIpcMain.handle('get-used-applications', async () => {
  const lastStart = await Log.getLastApplicationStart();
  const applications = await ActiveWindow.getUsedApplications(lastStart);
  return applications;
});

typedIpcMain.handle('open-artifact', async (e, artifact) => {
  TaskSnap.getInstance().openArtifact(artifact);
});

typedIpcMain.handle('get-latest-snapshot', async () => {
  return await SnapshotManager.getInstance().getLatestSnapshot();
});
