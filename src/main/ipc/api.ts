/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, March 2023
 */

import typedIpcMain from './typedIpcMain';
import SnapshotManager from '../SnapshotManager';
import { nativeTheme } from 'electron';
import TaskSnap from '../TaskSnap';
import UsageData from '../entity/UsageData';
import DeviceManager from '../HID/DeviceManager';
import UserSettings from 'types/UserSettings';
import Settings from '../entity/Settings';
import { Database } from '../database';
import StudyManager from '../StudyManager';
import WindowManager from '../WindowManager';
import ActiveTaskSession from '../ActiveTaskSession';
import BrowserTracker from '../trackers/BrowserTracker';
import VSCodeTracker from '../trackers/VSCodeTracker';
import Snapshot from '../entity/Snapshot';
import BrowserEntity from '../entity/Browser';
import BrowserTabEntity from '../entity/BrowserTab';
import IDEEntity from '../entity/IDE';
import IDEFileEntity from '../entity/IDEFile';
import ApplicationEntity from '../entity/Application';
import FileEntity from '../entity/File';
import { BrowserType } from 'types/BrowserType';

typedIpcMain.handle('get-snapshot-by-id', async (e, id) => {
  return await SnapshotManager.getInstance().getSnapshotById(id);
});

typedIpcMain.handle('get-latest-n-snapshots', async (e, n) => {
  return await SnapshotManager.getInstance().getLatestNSnapshots(n);
});

// subtasks (Phase 2)
typedIpcMain.handle('get-snapshot-children', async (e, parentId) => {
  return await SnapshotManager.getInstance().getChildren(parentId);
});

typedIpcMain.handle('create-subtask', async (e, parentId, name) => {
  return await SnapshotManager.getInstance().createSubtask(parentId, name);
});

typedIpcMain.handle('rename-snapshot', async (e, snapshotId, name) => {
  await SnapshotManager.getInstance().renameSnapshot(snapshotId, name);
});

// Legacy: still used by the old create-task-with-picker flow (currently
// only exercised by the upgrade path / tests).
typedIpcMain.handle('get-currently-open-applications', async () => {
  return await TaskSnap.getInstance().getCurrentlyOpenApplications();
});

typedIpcMain.handle(
  'create-task',
  async (e, name, browsers, ides, applications, parentId) => {
    return await SnapshotManager.getInstance().createTask(
      name,
      browsers,
      ides,
      applications,
      parentId ?? null
    );
  }
);

// ---------- Start / stop / commit (active-task session model) ----------

// Stable keys shared with the renderer's CommitTaskDialog. The renderer
// builds the same strings to decide which rows to pre-check.
const keyBrowser = (type: BrowserType) => `browser:${type}`;
const keyTab = (type: BrowserType, url: string) => `tab:${type}|${url}`;
const keyIde = (i: { workspacePath?: string; path: string }) =>
  `ide:${i.workspacePath || i.path}`;
const keyIdeFile = (
  i: { workspacePath?: string; path: string },
  f: { path: string }
) => `idef:${i.workspacePath || i.path}|${f.path}`;
const keyApp = (a: { path: string }) => `app:${a.path}`;
const keyFile = (a: { path: string }, f: { path: string }) =>
  `file:${a.path}|${f.path}`;

typedIpcMain.handle('start-task', async (e, name, parentId) => {
  // If a task is already active, the renderer should stop+commit it first.
  // Treat a duplicate start as a discard of any leftover buffer + a fresh start.
  if (ActiveTaskSession.getInstance().isActive()) {
    ActiveTaskSession.getInstance().discard();
  }
  const snap = await SnapshotManager.getInstance().startEmptyTask(
    name,
    parentId ?? null
  );
  ActiveTaskSession.getInstance().start(snap.id, snap.name);
  WindowManager.mainWindow?.webContents.send('snapshots-changed');
  return snap;
});

typedIpcMain.handle('resume-task', async (e, taskId) => {
  const snap = await Snapshot.findOneBy({ id: taskId });
  if (!snap) throw new Error(`Task ${taskId} not found`);
  if (ActiveTaskSession.getInstance().isActive()) {
    ActiveTaskSession.getInstance().discard();
  }
  ActiveTaskSession.getInstance().resume(snap.id, snap.name);
  snap.lastChange = new Date().toISOString();
  await snap.save();
  WindowManager.mainWindow?.webContents.send('snapshots-changed');
  return snap;
});

typedIpcMain.handle('get-active-task', async () => {
  const id = ActiveTaskSession.getInstance().getActiveTaskId();
  if (id === null) return null;
  const snap = await Snapshot.findOneBy({ id });
  if (!snap) return null;
  return { id: snap.id, name: snap.name };
});

typedIpcMain.handle('stop-task', async () => {
  const stopped = ActiveTaskSession.getInstance().stop();
  if (!stopped) return null;

  // Load whatever was previously committed to this task so we can pre-check
  // those rows on the picker (lets the user resume the same set easily).
  const prev = await Snapshot.getSnapshotById(stopped.taskId);
  const previousKeys = new Set<string>();
  const prevBrowsersByType = new Map<BrowserType, BrowserEntity>();
  const prevIdesByKey = new Map<string, IDEEntity>();
  const prevAppsByPath = new Map<string, ApplicationEntity>();
  if (prev) {
    (prev.browsers ?? []).forEach((b) => {
      previousKeys.add(keyBrowser(b.type));
      prevBrowsersByType.set(b.type, b);
      (b.browserTabs ?? []).forEach((t) =>
        previousKeys.add(keyTab(b.type, t.url))
      );
    });
    (prev.ides ?? []).forEach((i) => {
      previousKeys.add(keyIde(i));
      prevIdesByKey.set(keyIde(i), i);
      (i.ideFiles ?? []).forEach((f) =>
        previousKeys.add(keyIdeFile(i, f))
      );
    });
    (prev.applications ?? []).forEach((a) => {
      previousKeys.add(keyApp(a));
      prevAppsByPath.set(a.path, a);
    });
  }

  // Build merged BROWSERS: hydrate per-type with the live extension snapshot
  // so we get fresh titles + favIconUrls for currently-open tabs.
  const liveBrowsers = BrowserTracker.getInstance().getSnapshotInformation();
  const trackedKeys = new Set<string>();
  const browserList: BrowserEntity[] = [];
  const allBrowserTypes = new Set<BrowserType>([
    ...stopped.browsers.map((b) => b.type),
    ...prevBrowsersByType.keys(),
  ]);
  for (const type of allBrowserTypes) {
    const trackedEntry = stopped.browsers.find((b) => b.type === type);
    const prevEntry = prevBrowsersByType.get(type);
    const liveWindows = liveBrowsers.get(type) ?? [];

    const b = new BrowserEntity();
    b.type = type;
    b.name = trackedEntry?.app.name ?? prevEntry?.name ?? type;
    b.path = trackedEntry?.app.path ?? prevEntry?.path ?? '';
    b.icon = trackedEntry?.app.icon ?? prevEntry?.icon ?? '';
    b.title = trackedEntry?.app.title ?? prevEntry?.title ?? type;
    b.isSelected = true;
    b.relevance = 0;

    // Union of tabs from: tracked (with live hydration), previous-committed.
    const byUrl = new Map<string, BrowserTabEntity>();
    // Live tabs first so we have favicons.
    liveWindows.forEach((w) =>
      (w.browserTabs ?? []).forEach((t) => {
        if (!byUrl.has(t.url)) byUrl.set(t.url, t);
      })
    );
    // Tracked overlay.
    (trackedEntry?.tabs ?? []).forEach((tt) => {
      const existing = byUrl.get(tt.url);
      if (existing) {
        if (!existing.title && tt.title) existing.title = tt.title;
      } else {
        const t = new BrowserTabEntity();
        t.url = tt.url;
        t.title = tt.title;
        t.favIconUrl = '';
        t.index = 0;
        t.isActive = false;
        t.isSelected = true;
        t.relevance = 0;
        byUrl.set(tt.url, t);
      }
      trackedKeys.add(keyTab(type, tt.url));
    });
    if (trackedEntry) trackedKeys.add(keyBrowser(type));
    // Previously-committed tabs.
    (prevEntry?.browserTabs ?? []).forEach((pt) => {
      if (!byUrl.has(pt.url)) {
        const t = new BrowserTabEntity();
        t.url = pt.url;
        t.title = pt.title;
        t.favIconUrl = pt.favIconUrl;
        t.index = pt.index ?? 0;
        t.isActive = false;
        t.isSelected = true;
        t.relevance = 0;
        byUrl.set(pt.url, t);
      }
    });
    b.browserTabs = Array.from(byUrl.values());
    browserList.push(b);
  }

  // Build merged IDES. Try to hydrate VS Code workspace info from the live
  // extension; touched files contribute to the file union.
  const vscodeSnap = await VSCodeTracker.getInstance().requestVSCodeSnapshot();
  const ideList: IDEEntity[] = [];
  const trackedIdeKeys = new Set<string>();
  // Build merged keyset (tracked-by-path ∪ previous-by-key)
  const allIdeEntries = new Map<
    string,
    {
      tracked?: typeof stopped.ides[number];
      prev?: IDEEntity;
    }
  >();
  stopped.ides.forEach((ti) => {
    const k = `ide:${ti.path}`;
    allIdeEntries.set(k, { tracked: ti });
    trackedIdeKeys.add(k);
  });
  prevIdesByKey.forEach((prevIde, k) => {
    const existing = allIdeEntries.get(k);
    if (existing) existing.prev = prevIde;
    else allIdeEntries.set(k, { prev: prevIde });
  });
  for (const [, entry] of allIdeEntries) {
    const tracked = entry.tracked;
    const prevIde = entry.prev;
    const i = new IDEEntity();
    i.name = tracked?.name ?? prevIde?.name ?? 'IDE';
    i.path = tracked?.path ?? prevIde?.path ?? '';
    i.icon = tracked?.icon ?? prevIde?.icon ?? '';
    i.title = tracked?.title ?? prevIde?.title ?? i.name;
    i.branch = prevIde?.branch ?? (vscodeSnap?.branch ?? '');
    i.lastCommitMessage =
      prevIde?.lastCommitMessage ?? vscodeSnap?.lastCommit?.message ?? '';
    i.workspaceName =
      prevIde?.workspaceName ?? vscodeSnap?.workspaceName ?? '';
    i.workspacePath =
      prevIde?.workspacePath ?? vscodeSnap?.workspacePath ?? '';
    i.isSelected = true;
    i.relevance = 0;

    // File union: previously-committed files + tracked files (from VS Code).
    // We only have a tracked-files buffer at top-level (not per-IDE), so we
    // attach them only when this IDE looks like VS Code.
    const byPath = new Map<string, IDEFileEntity>();
    (prevIde?.ideFiles ?? []).forEach((f) => byPath.set(f.path, f));
    const looksLikeVSCode = /code/i.test(i.name) || /code/i.test(i.path);
    if (looksLikeVSCode) {
      // Tracked file paths first.
      stopped.files.forEach((tf) => {
        if (!byPath.has(tf.path)) {
          const fe = new IDEFileEntity();
          fe.name = tf.path.split('/').pop() ?? tf.path;
          fe.path = tf.path;
          fe.isActive = false;
          fe.isSelected = true;
          fe.relevance = 0;
          byPath.set(tf.path, fe);
        }
        trackedKeys.add(keyIdeFile(i, { path: tf.path }));
      });
      // Live VS Code snapshot files (in case tracker missed them but they're open now).
      (vscodeSnap?.openFiles ?? []).forEach((of) => {
        if (!byPath.has(of.path)) {
          const fe = new IDEFileEntity();
          fe.name = of.name;
          fe.path = of.path;
          fe.isActive = !!of.isActive;
          fe.isSelected = true;
          fe.relevance = 0;
          byPath.set(of.path, fe);
        }
      });
    }
    i.ideFiles = Array.from(byPath.values());
    ideList.push(i);
  }
  trackedIdeKeys.forEach((k) => trackedKeys.add(k));

  // Build merged APPLICATIONS.
  const appList: ApplicationEntity[] = [];
  const allAppPaths = new Set<string>([
    ...stopped.apps.map((a) => a.path),
    ...prevAppsByPath.keys(),
  ]);
  for (const path of allAppPaths) {
    const tracked = stopped.apps.find((a) => a.path === path);
    const prevApp = prevAppsByPath.get(path);
    const a = new ApplicationEntity();
    a.name = tracked?.name ?? prevApp?.name ?? path;
    a.path = path;
    a.icon = tracked?.icon ?? prevApp?.icon ?? '';
    a.title = tracked?.title ?? prevApp?.title ?? a.name;
    a.isSelected = true;
    a.relevance = 0;
    // Carry previously-committed files (we don't track app files live).
    a.files = (prevApp?.files ?? []).map((f) => {
      const fe = new FileEntity();
      fe.name = f.name;
      fe.path = f.path;
      fe.isSelected = true;
      return fe;
    });
    if (tracked) trackedKeys.add(keyApp(a));
    appList.push(a);
  }

  return {
    taskId: stopped.taskId,
    taskName: stopped.taskName,
    browsers: browserList,
    ides: ideList,
    applications: appList,
    previousKeys: Array.from(previousKeys),
    trackedKeys: Array.from(trackedKeys),
  };
});

typedIpcMain.handle(
  'commit-task-artefacts',
  async (e, taskId, browsers, ides, applications) => {
    await SnapshotManager.getInstance().commitTaskArtefacts(
      taskId,
      browsers,
      ides,
      applications
    );
    WindowManager.mainWindow?.webContents.send('snapshots-changed');
  }
);

typedIpcMain.handle('discard-active-task', async () => {
  ActiveTaskSession.getInstance().discard();
});

// settings
typedIpcMain.handle('get-settings', async () => {
  const userSettings: UserSettings = {
    isDarkModeEnabled: nativeTheme.shouldUseDarkColors,
    isDataAnonymized: await Settings.getIsDataAnonymized(),
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

typedIpcMain.handle('open-settings-window', async () => {
  if (WindowManager.settingsWindow === null) {
    await WindowManager.createSettingsWindow();
  } else {
    WindowManager.settingsWindow.show();
    WindowManager.settingsWindow.focus();
  }
});

// questionnaires
typedIpcMain.handle('get-study-phase', () => {
  return StudyManager.getStudyPhase();
});


