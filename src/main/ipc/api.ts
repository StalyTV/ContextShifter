/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, March 2023
 */

import typedIpcMain from './typedIpcMain';
import SnapshotManager from '../SnapshotManager';
import { nativeTheme } from 'electron';
import { openArtifact } from '../helpers/osCommands';
import WindowManager from '../WindowManager';
import SnapshotEntity from '../entity/Snapshot';
import TaskSnap from '../TaskSnap';
import UsageData from '../entity/UsageData';
import DeviceManager from '../HID/DeviceManager';
import UserSettings from 'types/UserSettings';
import Settings from '../entity/Settings';
import { Database } from '../database';
import { UsageDataOrigin } from '../../types/UsageDataOrigin';
import StudyManager from '../StudyManager';
import QuestionnaireAnswers from '../entity/QuestionnaireAnswers';
import { info } from 'electron-log';

typedIpcMain.handle('open-artifact', async (e, artifact) => {
  await UsageData.addEntry('open-artifact', false, JSON.stringify(artifact));
  openArtifact(artifact);
});

typedIpcMain.handle('open-all-artifacts-of-snapshot', async (e, snapshot) => {
  TaskSnap.getInstance().restoreSnapshot(
    snapshot,
    UsageDataOrigin.SnapshotWindow
  );
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

typedIpcMain.handle('delete-snapshot', async (e, snapshotId) => {
  await SnapshotManager.getInstance().deleteSnapshot(
    snapshotId,
    UsageDataOrigin.SnapshotWindow
  );
  WindowManager.snapshotWindow?.close();
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
      `id: ${snapshot.id}, origin: ${UsageDataOrigin.SnapshotWindow}`
    );
    await SnapshotManager.getInstance().saveAndCloseApplications(snapshot);
    WindowManager.snapshotWindow?.close();
  }
);

typedIpcMain.handle('postpone-snapshot', async (e, snapshot, timeInMin) => {
  await SnapshotManager.getInstance().saveSnapshot(snapshot);
  await SnapshotManager.getInstance().postponeSnapshot(
    snapshot.id,
    timeInMin,
    UsageDataOrigin.SnapshotWindow
  );
  WindowManager.snapshotWindow?.close();
});

typedIpcMain.handle('merge-snapshots', async (e, fromId, toId) => {
  const snapshotManager = SnapshotManager.getInstance();
  const fromSnapshot = await snapshotManager.getSnapshotById(fromId);
  const toSnapshot = await snapshotManager.getSnapshotById(toId);
  if (fromSnapshot && toSnapshot) {
    await snapshotManager.mergeSnapshots(fromSnapshot, toSnapshot);
  }
});

typedIpcMain.handle('get-merge-recommendations', async () => {
  return await SnapshotManager.getInstance().getMergeRecommendations();
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
      UsageDataOrigin.InstantCurationWindow
    );
    WindowManager.instantCurationWindow?.close();
  }
);

typedIpcMain.handle(
  'instant-curation-delete-snapshot',
  async (e, snapshotId) => {
    await SnapshotManager.getInstance().deleteSnapshot(
      snapshotId,
      UsageDataOrigin.InstantCurationWindow
    );
    WindowManager.instantCurationWindow?.close();
  }
);

typedIpcMain.handle(
  'instant-curation-close-applications',
  async (e, snapshotId, updatedName) => {
    await UsageData.addEntry(
      'save-snapshot-and-close-applications',
      false,
      `id: ${snapshotId}, origin: ${UsageDataOrigin.InstantCurationWindow}`
    );
    await SnapshotManager.getInstance().updateSnapshotNameAndCloseApplications(
      snapshotId,
      updatedName
    );
  }
);

// snapshot gallery
typedIpcMain.handle('open-snapshot', async (e, snapshotId) => {
  await UsageData.addEntry('open-snapshot', false, `id: ${snapshotId}`);
  SnapshotManager.getInstance().openSnapshotInSnapshotWindow(snapshotId);
});

typedIpcMain.handle('gallery-delete-snapshot', async (e, snapshotId) => {
  await SnapshotManager.getInstance().deleteSnapshot(
    snapshotId,
    UsageDataOrigin.SnapshotGalleryWindow
  );
});

typedIpcMain.handle('restore-snapshot', async (e, snapshotId) => {
  const snapshot = await SnapshotEntity.getSnapshotById(snapshotId);
  if (snapshot) {
    await TaskSnap.getInstance().restoreSnapshot(
      snapshot,
      UsageDataOrigin.SnapshotGalleryWindow
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
  TaskSnap.getInstance().storeBrowserTabsToOpen(browser, [browserTab.url]);
});

typedIpcMain.handle('open-ide-file', async (e, ide, file) => {
  await UsageData.addEntry('open-ide-file');
  TaskSnap.getInstance().openIDEFiles(ide, [file.path]);
});

typedIpcMain.handle('get-total-num-snapshots', async () => {
  return SnapshotEntity.getTotalNumSnapshots();
});

// settings
typedIpcMain.handle('get-settings', async () => {
  const userSettings: UserSettings = {
    isDarkModeEnabled: nativeTheme.shouldUseDarkColors,
    isDataAnonymized: await Settings.getIsDataAnonymized(),
    snapshotShortcut: await Settings.getSnapshotShortcut(),
    endOfDayPopUpTime: await Settings.getEndOfDayPopUpTime(),
    showQuestionnaireOnlyOnWorkdays:
      await Settings.getShowQuestionnaireOnlyOnWorkdays()
  };
  return userSettings;
});

typedIpcMain.handle('set-settings', async (e, updatedSettings) => {
  if (updatedSettings.isDarkModeEnabled) {
    nativeTheme.themeSource = 'dark';
  } else {
    nativeTheme.themeSource = 'light';
  }

  await Database.manager.save(Settings, {
    key: 'isDataAnonymized',
    value: updatedSettings.isDataAnonymized ? 'true' : 'false'
  });
  await Database.manager.save(Settings, {
    key: 'snapshotShortcut',
    value: updatedSettings.snapshotShortcut
  });
  await Database.manager.save(Settings, {
    key: 'endOfDayPopUpTime',
    value: updatedSettings.endOfDayPopUpTime.toISOString()
  });
  await Database.manager.save(Settings, {
    key: 'showQuestionnaireOnlyOnWorkdays',
    value: updatedSettings.showQuestionnaireOnlyOnWorkdays ? 'true' : 'false'
  });
  await UsageData.addEntry(
    'update-settings',
    false,
    JSON.stringify(updatedSettings)
  );
});

typedIpcMain.handle('get-extensions-status', async () => {
  return TaskSnap.getInstance().getExtensionsStatus();
});

typedIpcMain.handle('get-device-status', async () => {
  return DeviceManager.getInstance().isDeviceConnected();
});

typedIpcMain.handle('get-known-applications', async () => {
  return TaskSnap.getInstance().getKnownApplications();
});

typedIpcMain.handle('update-known-application', async (e, app) => {
  await TaskSnap.getInstance().updateKnownApplication(app);
});

// questionnaires
typedIpcMain.handle('get-study-phase', () => {
  return StudyManager.getStudyPhase();
});

typedIpcMain.handle('postpone-end-of-day-questionnaire', (e, minutes) => {
  return StudyManager.postponeEndOfDayQuestionnaire(minutes);
});

typedIpcMain.handle(
  'save-end-of-day-questionnaire',
  async (e, json: string) => {
    await QuestionnaireAnswers.insert({
      ts: new Date().toISOString(),
      type: 'end-of-day',
      studyPhase: StudyManager.getStudyPhase(),
      answers: json
    });
    WindowManager.endOfDayWindow?.close();
    info(`[API] Saved end-of-day questionnaire`);
  }
);

typedIpcMain.handle(
  'save-task-resumption-questionnaire',
  async (e, json: string, snapshotId: number | null) => {
    await QuestionnaireAnswers.insert({
      ts: new Date().toISOString(),
      type: 'task-resumption',
      studyPhase: StudyManager.getStudyPhase(),
      answers: json,
      additionalInformation: `snapshotId: ${snapshotId}`
    });
    WindowManager.taskResumptionWindow?.close();
    info(`[API] Saved task resumption questionnaire`);
  }
);

typedIpcMain.handle('get-last-two-snapshots-of-today', async () => {
  return await SnapshotEntity.getLastTwoSnapshotsOfToday();
});
