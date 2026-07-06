/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, March 2023
 */

import typedIpcMain from './typedIpcMain';
import SnapshotManager from '../SnapshotManager';
import { nativeTheme, dialog } from 'electron';
import { app as electronApp } from 'electron';
import path from 'path';
import ContextShifter from '../ContextShifter';
import UsageData from '../entity/UsageData';
import DeviceManager from '../HID/DeviceManager';
import UserSettings from 'types/UserSettings';
import Settings from '../entity/Settings';
import { Database } from '../database';
import StudyManager from '../StudyManager';
import WindowManager from '../WindowManager';
import ActiveTaskSession, { StoppedSession } from '../ActiveTaskSession';
import TaskRestorer from '../TaskRestorer';
import BrowserTracker from '../trackers/BrowserTracker';
import VSCodeTracker from '../trackers/VSCodeTracker';
import Snapshot from '../entity/Snapshot';
import BrowserEntity from '../entity/Browser';
import BrowserTabEntity from '../entity/BrowserTab';
import IDEEntity from '../entity/IDE';
import IDEFileEntity from '../entity/IDEFile';
import ApplicationEntity from '../entity/Application';
import FileEntity from '../entity/File';
import NeverCloseBrowserTab from '../entity/NeverCloseBrowserTab';
import KnownApplication from '../entity/KnownApplication';
import ArtifactScorer from '../ArtifactScorer';
import ScoreWeights from '../ScoreWeights';
import StudyDataCollector from '../StudyDataCollector';
import { isBlankTab } from '../helpers/isBlankTab';
import { BrowserType } from 'types/BrowserType';
import { OpenBrowserTab, StoppedTaskBundle } from 'types/Commands';

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

typedIpcMain.handle('delete-snapshot', async (e, snapshotId) => {
  await SnapshotManager.getInstance().deleteSnapshot(snapshotId);
  WindowManager.mainWindow?.webContents.send('snapshots-changed');
});

// Legacy: still used by the old create-task-with-picker flow (currently
// only exercised by the upgrade path / tests).
typedIpcMain.handle('get-currently-open-applications', async () => {
  return await ContextShifter.getInstance().getCurrentlyOpenApplications();
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

typedIpcMain.handle('start-task', async (e, name, parentId, declutter) => {
  // If a task is already active, the renderer should stop+commit it first.
  // Treat a duplicate start as a discard of any leftover buffer + a fresh start.
  if (ActiveTaskSession.getInstance().isActive()) {
    await ActiveTaskSession.getInstance().discard();
  }
  const snap = await SnapshotManager.getInstance().startEmptyTask(
    name,
    parentId ?? null
  );
  await ActiveTaskSession.getInstance().start(snap.id, snap.name);
  WindowManager.mainWindow?.webContents.send('snapshots-changed');
  // "Declutter and start": close everything currently open except never-close
  // artefacts so the task begins from a clean slate. Run in the background so
  // the UI returns immediately; TaskRestorer.declutter logs its own errors.
  if (declutter) {
    TaskRestorer.declutter().catch(() => undefined);
  }
  return snap;
});

typedIpcMain.handle('resume-task', async (e, taskId) => {
  const snap = await Snapshot.findOneBy({ id: taskId });
  if (!snap) throw new Error(`Task ${taskId} not found`);
  if (ActiveTaskSession.getInstance().isActive()) {
    await ActiveTaskSession.getInstance().discard();
  }
  await ActiveTaskSession.getInstance().resume(snap.id, snap.name);
  snap.lastChange = new Date().toISOString();
  await snap.save();
  WindowManager.mainWindow?.webContents.send('snapshots-changed');
  // Restore the task's context: open its artefacts and close the rest
  // (except never-close apps / the file explorer / ContextShifter itself).
  await TaskRestorer.restore(snap.id);
  return snap;
});

typedIpcMain.handle('get-active-task', async () => {
  const id = ActiveTaskSession.getInstance().getActiveTaskId();
  if (id === null) return null;
  const snap = await Snapshot.findOneBy({ id });
  if (!snap) return null;
  return { id: snap.id, name: snap.name };
});

// Fetch a favicon and inline it as a data URL, so the renderer can read its
// pixels (to derive the tab's colour) without a tainted canvas. Cached; times
// out fast; returns '' on failure. Fetched main-side, so no CORS restriction.
const faviconCache = new Map<string, string>();
async function faviconDataUrl(
  pageUrl: string,
  favUrl?: string
): Promise<string> {
  const cacheKey = favUrl || pageUrl;
  const hit = faviconCache.get(cacheKey);
  if (hit != null) return hit;
  let host = '';
  try {
    host = new URL(pageUrl).hostname;
  } catch {
    // ignore
  }
  const candidates = [
    favUrl && /^https?:\/\//.test(favUrl) ? favUrl : '',
    host
      ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(
          host
        )}&sz=64`
      : '',
  ].filter(Boolean);

  for (const url of candidates) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2500);
      // eslint-disable-next-line no-await-in-loop
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) continue;
      const mime = res.headers.get('content-type') || 'image/png';
      // eslint-disable-next-line no-await-in-loop
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0) continue;
      const dataUrl = `data:${mime};base64,${buf.toString('base64')}`;
      faviconCache.set(cacheKey, dataUrl);
      return dataUrl;
    } catch {
      // try next candidate
    }
  }
  faviconCache.set(cacheKey, '');
  return '';
}

async function buildStoppedBundle(
  stopped: StoppedSession
): Promise<StoppedTaskBundle> {
  // Per-artefact scores from accumulated usage, computed at the switch moment.
  const tabScore = new Map<string, number>();
  const tabSemantic = new Map<string, number>();
  stopped.browsers.forEach((b) =>
    b.tabs.forEach((t) => {
      tabScore.set(t.url, t.score ?? 0);
      if (t.semanticScore != null) tabSemantic.set(t.url, t.semanticScore);
    })
  );
  const fileScore = new Map<string, number>();
  const fileSemantic = new Map<string, number>();
  stopped.files.forEach((f) => {
    fileScore.set(f.path, f.score ?? 0);
    if (f.semanticScore != null) fileSemantic.set(f.path, f.semanticScore);
  });
  const appScore = new Map<string, number>();
  const appSemantic = new Map<string, number>();
  stopped.apps.forEach((a) => {
    appScore.set(a.path, a.score ?? 0);
    if (a.semanticScore != null) appSemantic.set(a.path, a.semanticScore);
  });
  const ideScore = new Map<string, number>();
  const ideSemantic = new Map<string, number>();
  stopped.ides.forEach((i) => {
    ideScore.set(i.path, i.score ?? 0);
    if (i.semanticScore != null) ideSemantic.set(i.path, i.semanticScore);
  });

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
    // Which profile each currently-open URL lives in (for tabs the live
    // snapshot knows about; used to backfill profile onto tracked-only tabs).
    const liveProfileByUrl = new Map<string, { id: string; email: string }>();
    // Live tabs first so we have favicons.
    liveWindows.forEach((w) =>
      (w.browserTabs ?? []).forEach((t) => {
        if (t.profileId && !liveProfileByUrl.has(t.url)) {
          liveProfileByUrl.set(t.url, {
            id: t.profileId,
            email: t.profileEmail,
          });
        }
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
        // Preserve the profile this tab was previously committed under.
        t.profileId = pt.profileId;
        t.profileEmail = pt.profileEmail;
        byUrl.set(pt.url, t);
      }
    });
    // Drop empty/new-tab pages — they aren't meaningful artefacts.
    b.browserTabs = Array.from(byUrl.values()).filter(
      (t) => !isBlankTab(t.url)
    );
    // Attach per-tab scores; the browser row's score is its best tab. Backfill
    // the profile from the live snapshot for any tab that doesn't have one yet.
    b.browserTabs.forEach((t) => {
      t.relevance = tabScore.get(t.url) ?? t.relevance ?? 0;
      const sem = tabSemantic.get(t.url);
      if (sem != null) t.semanticRelevance = sem;
      if (!t.profileId) {
        const p = liveProfileByUrl.get(t.url);
        if (p) {
          t.profileId = p.id;
          t.profileEmail = p.email;
        }
      }
    });
    b.relevance = b.browserTabs.reduce(
      (m, t) => Math.max(m, t.relevance ?? 0),
      0
    );
    // Browser row's semantic = its best tab's (undefined if none computed).
    b.semanticRelevance = b.browserTabs.reduce<number | undefined>(
      (m, t) =>
        t.semanticRelevance != null
          ? Math.max(m ?? 0, t.semanticRelevance)
          : m,
      undefined
    ) as number;
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
  // Collect every IDE's workspace folder so a tracked/open file can be matched
  // to the project it actually belongs to (and not leak into another IDE).
  const allWorkspacePaths = new Set<string>();
  for (const [, entry] of allIdeEntries) {
    const ws = entry.prev?.workspacePath || (vscodeSnap?.workspacePath ?? '');
    if (ws) allWorkspacePaths.add(ws);
  }
  const underWorkspace = (filePath: string, ws: string) =>
    !!ws &&
    (filePath === ws ||
      filePath.startsWith(ws.endsWith('/') ? ws : `${ws}/`));
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
    i.workspaceSelected = prevIde?.workspaceSelected ?? true;
    i.isSelected = true;
    i.relevance = 0;

    // File union: previously-committed files + tracked files (from VS Code).
    // We only have a tracked-files buffer at top-level (not per-IDE), so we
    // attach them only when this IDE looks like VS Code.
    const byPath = new Map<string, IDEFileEntity>();
    (prevIde?.ideFiles ?? []).forEach((f) => byPath.set(f.path, f));
    const looksLikeVSCode = /code/i.test(i.name) || /code/i.test(i.path);
    if (looksLikeVSCode) {
      // Only attach files that belong to THIS IDE's project folder, so files
      // from a different VS Code window don't leak into this one. An IDE with a
      // known workspace takes files under it; an IDE with no known workspace
      // takes only files not claimed by any other workspace.
      const wp = i.workspacePath;
      const otherWorkspaces = Array.from(allWorkspacePaths).filter(
        (w) => w !== wp
      );
      const fileBelongs = (filePath: string): boolean => {
        if (wp) return underWorkspace(filePath, wp);
        return !otherWorkspaces.some((w) => underWorkspace(filePath, w));
      };

      // Tracked file paths first.
      stopped.files.forEach((tf) => {
        if (!fileBelongs(tf.path)) return;
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
        if (!fileBelongs(of.path)) return;
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
    // Attach per-file scores; the IDE row's score is the best of its files and
    // its own (no-file focus) score.
    i.ideFiles.forEach((f) => {
      f.relevance = fileScore.get(f.path) ?? f.relevance ?? 0;
      const sem = fileSemantic.get(f.path);
      if (sem != null) f.semanticRelevance = sem;
    });
    i.relevance = i.ideFiles.reduce(
      (m, f) => Math.max(m, f.relevance ?? 0),
      ideScore.get(i.path) ?? 0
    );
    const ideSem = ideSemantic.get(i.path);
    if (ideSem != null) i.semanticRelevance = ideSem;
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
    a.relevance = appScore.get(path) ?? 0;
    const appSem = appSemantic.get(path);
    if (appSem != null) a.semanticRelevance = appSem;
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

  // Exclude apps the user marked "never close" from the artefact picker — they
  // stay open across task switches, so they shouldn't be associated with tasks.
  const neverClose = await KnownApplication.getAppsThatShouldNeverBeClosed();
  const neverClosePaths = new Set(neverClose.map((a) => a.path));
  const neverCloseNames = new Set(
    neverClose.map((a) => a.name.toLowerCase())
  );
  const isNeverClose = (name?: string, path?: string) =>
    (path != null && neverClosePaths.has(path)) ||
    (name != null && neverCloseNames.has(name.toLowerCase()));

  // Merge duplicate IDE rows: a tracked IDE is keyed by its app path while a
  // previously-committed IDE is keyed by its workspace folder, so the same
  // project could appear twice. Collapse by keyIde (workspace || path),
  // unioning files and keeping the best score.
  const dedupedIdeMap = new Map<string, IDEEntity>();
  for (const i of ideList) {
    const k = keyIde(i);
    const existing = dedupedIdeMap.get(k);
    if (!existing) {
      dedupedIdeMap.set(k, i);
      continue;
    }
    const byPathMerge = new Map<string, IDEFileEntity>();
    (existing.ideFiles ?? []).forEach((f) => byPathMerge.set(f.path, f));
    (i.ideFiles ?? []).forEach((f) => {
      const e = byPathMerge.get(f.path);
      if (e) e.relevance = Math.max(e.relevance ?? 0, f.relevance ?? 0);
      else byPathMerge.set(f.path, f);
    });
    existing.ideFiles = Array.from(byPathMerge.values());
    existing.relevance = Math.max(existing.relevance ?? 0, i.relevance ?? 0);
    if (!existing.workspacePath && i.workspacePath)
      existing.workspacePath = i.workspacePath;
    if (!existing.workspaceName && i.workspaceName)
      existing.workspaceName = i.workspaceName;
  }
  const dedupedIdes = Array.from(dedupedIdeMap.values());

  const filteredApps = appList.filter((a) => !isNeverClose(a.name, a.path));
  const filteredIdes = dedupedIdes.filter((i) => !isNeverClose(i.name, i.path));

  // Auto-select: pick leaf artefacts scoring above the threshold, then also
  // check their parent rows (browser / IDE) so the selection is consistent.
  const leafScores = new Map<string, number>();
  browserList.forEach((b) =>
    b.browserTabs.forEach((t) =>
      leafScores.set(keyTab(b.type, t.url), t.relevance ?? 0)
    )
  );
  filteredIdes.forEach((i) => {
    (i.ideFiles ?? []).forEach((f) =>
      leafScores.set(keyIdeFile(i, f), f.relevance ?? 0)
    );
    leafScores.set(keyIde(i), ideScore.get(i.path) ?? 0);
  });
  filteredApps.forEach((a) => leafScores.set(keyApp(a), a.relevance ?? 0));

  const selectedLeaves = ArtifactScorer.selectAboveThreshold(leafScores);
  const autoSelect = new Set<string>(selectedLeaves);
  browserList.forEach((b) =>
    b.browserTabs.forEach((t) => {
      if (selectedLeaves.has(keyTab(b.type, t.url)))
        autoSelect.add(keyBrowser(b.type));
    })
  );
  filteredIdes.forEach((i) =>
    (i.ideFiles ?? []).forEach((f) => {
      if (selectedLeaves.has(keyIdeFile(i, f))) autoSelect.add(keyIde(i));
    })
  );

  // Resolve each timeline artefact key to an icon (for its colour) + a short
  // label, once per unique key (favicon fetches are expensive). Tabs use their
  // real favicon (fetched as a data URL) so the colour matches the site (e.g.
  // Twitch = purple), not the browser's multicolour app icon.
  const appIconByPath = new Map(stopped.apps.map((a) => [a.path, a]));
  const ideIconByPath = new Map(stopped.ides.map((i) => [i.path, i]));
  const tabMetaByUrl = new Map<string, { title: string }>();
  const favIconByUrl = new Map<string, string>();
  stopped.browsers.forEach((b) => {
    b.tabs.forEach((t) => tabMetaByUrl.set(t.url, { title: t.title }));
  });
  browserList.forEach((b) =>
    (b.browserTabs ?? []).forEach((t) => {
      if (t.url && t.favIconUrl) favIconByUrl.set(t.url, t.favIconUrl);
    })
  );
  const hostOf = (url: string): string => {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  };

  const timelineKeys = new Set<string>([
    ...stopped.markers.map((m) => m.key),
    ...stopped.segments.map((s) => s.key),
  ]);
  const iconLabelByKey = new Map<string, { icon: string; label: string }>();
  await Promise.all(
    Array.from(timelineKeys).map(async (key) => {
      let icon = '';
      let label = key;
      if (key.startsWith('app:')) {
        const path = key.slice('app:'.length);
        const a = appIconByPath.get(path);
        icon = a?.icon ?? '';
        label = a?.name ?? (path.split('/').pop() || path);
      } else if (key.startsWith('ide:')) {
        const path = key.slice('ide:'.length);
        const i = ideIconByPath.get(path);
        icon = i?.icon ?? '';
        label = i?.name ?? (path.split('/').pop() || path);
      } else if (key.startsWith('tab:')) {
        const url = key.slice('tab:'.length);
        icon = await faviconDataUrl(url, favIconByUrl.get(url));
        label = tabMetaByUrl.get(url)?.title || hostOf(url);
      } else if (key.startsWith('file:')) {
        const path = key.slice('file:'.length);
        label = path.split('/').pop() || path;
      }
      iconLabelByKey.set(key, { icon, label });
    })
  );

  const markers = stopped.markers.map((m) => {
    const il = iconLabelByKey.get(m.key) ?? { icon: '', label: m.key };
    return { t: m.t, key: m.key, kind: m.kind, icon: il.icon, label: il.label };
  });
  const segments = stopped.segments.map((s) => {
    const il = iconLabelByKey.get(s.key) ?? { icon: '', label: s.key };
    return {
      startMs: s.start,
      endMs: s.end,
      key: s.key,
      kind: s.kind,
      icon: il.icon,
      label: il.label,
    };
  });

  return {
    taskId: stopped.taskId,
    taskName: stopped.taskName,
    browsers: browserList,
    ides: filteredIdes,
    applications: filteredApps,
    previousKeys: Array.from(previousKeys),
    trackedKeys: Array.from(trackedKeys),
    autoSelectKeys: Array.from(autoSelect),
    sessionStartMs: stopped.sessionStartMs,
    sessionEndMs: stopped.sessionEndMs,
    floorMs: stopped.floorMs,
    lastTaskEndMs: stopped.lastTaskEndMs,
    preRollMs: stopped.preRollMs,
    markers,
    segments,
    idlePeriods: stopped.idlePeriods,
  };
}

typedIpcMain.handle('stop-task', async () => {
  const stopped = await ActiveTaskSession.getInstance().stop();
  if (!stopped) return null;
  return buildStoppedBundle(stopped);
});

// Re-score the just-stopped session as if only [startMs, endMs] happened
// (the end-of-task timeline trim). Does not persist.
typedIpcMain.handle('simulate-trim', async (e, startMs, endMs) => {
  const stopped = await ActiveTaskSession.getInstance().scoreWindow(
    startMs,
    endMs
  );
  if (!stopped) return null;
  return buildStoppedBundle(stopped);
});

typedIpcMain.handle(
  'commit-task-artefacts',
  async (e, taskId, browsers, ides, applications, trim) => {
    // Apply the timeline trim first (if the user curated the time window): this
    // re-persists ArtifactUsage with stats for the kept window only, so study
    // data + committed scores reflect the trimmed session. Then drop the
    // pending timeline.
    const session = ActiveTaskSession.getInstance();
    if (trim) {
      await session.commitTrim(trim.startMs, trim.endMs);
    } else {
      session.clearPending();
    }

    // Capture study data BEFORE committing artefact entities (commit can
    // prune/rewrite rows); the ArtifactUsage rows now hold the trimmed stats.
    if (await Settings.getIsStudyDataCollectionEnabled()) {
      const snap = await Snapshot.getSnapshotById(taskId);
      await StudyDataCollector.record(taskId, snap?.name ?? `Task ${taskId}`, {
        browsers: browsers ?? [],
        ides: ides ?? [],
        applications: applications ?? [],
      });
    }

    await SnapshotManager.getInstance().commitTaskArtefacts(
      taskId,
      browsers,
      ides,
      applications
    );
    WindowManager.mainWindow?.webContents.send('snapshots-changed');
  }
);

typedIpcMain.handle('get-score-weights', async () => {
  return ScoreWeights.get();
});

typedIpcMain.handle('set-score-weights', async (e, weights) => {
  const rescoredTasks = await ScoreWeights.update(weights);
  WindowManager.mainWindow?.webContents.send('snapshots-changed');
  return { rescoredTasks };
});

typedIpcMain.handle('clear-study-data', async () => {
  const cleared = await StudyDataCollector.clearAll();
  return { cleared };
});

typedIpcMain.handle('export-study-data', async () => {
  const count = await StudyDataCollector.count();
  if (count === 0) {
    return { canceled: false, count: 0, path: null };
  }
  const defaultName = `contextshifter-study-data-${
    new Date().toISOString().slice(0, 10)
  }.json`;
  const result = await dialog.showSaveDialog({
    title: 'Export Study Data',
    defaultPath: path.join(electronApp.getPath('downloads'), defaultName),
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePath) {
    return { canceled: true, count: 0, path: null };
  }
  const written = await StudyDataCollector.exportAll(result.filePath);
  return { canceled: false, count: written, path: result.filePath };
});

typedIpcMain.handle('discard-active-task', async () => {
  // Covers cancelling the picker after a stop too: drop any pending timeline
  // (the full session was already persisted at stop).
  await ActiveTaskSession.getInstance().discard();
  ActiveTaskSession.getInstance().abandonPending();
});

// settings
typedIpcMain.handle('get-settings', async () => {
  const userSettings: UserSettings = {
    isDarkModeEnabled: nativeTheme.shouldUseDarkColors,
    isDataAnonymized: await Settings.getIsDataAnonymized(),
    isArtefactSelectionEnabled:
      await Settings.getIsArtefactSelectionEnabled(),
    isStudyDataCollectionEnabled:
      await Settings.getIsStudyDataCollectionEnabled(),
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
    key: 'isArtefactSelectionEnabled',
    value: updatedSettings.isArtefactSelectionEnabled ? 'true' : 'false'
  });
  await Database.manager.save(Settings, {
    key: 'isStudyDataCollectionEnabled',
    value: updatedSettings.isStudyDataCollectionEnabled ? 'true' : 'false'
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
  return ContextShifter.getInstance().getExtensionsStatus();
});

typedIpcMain.handle('get-device-status', async () => {
  return DeviceManager.getInstance().isDeviceConnected();
});

typedIpcMain.handle('get-known-applications', async () => {
  return ContextShifter.getInstance().getKnownApplications();
});

typedIpcMain.handle('update-known-application', async (e, app) => {
  await ContextShifter.getInstance().updateKnownApplication(app);
});

// ---------- never-close browser tabs ----------

typedIpcMain.handle('get-open-browser-tabs', async () => {
  const live = BrowserTracker.getInstance().getSnapshotInformation();
  const byUrl = new Map<string, OpenBrowserTab>();
  live.forEach((windows, type) => {
    windows.forEach((win) => {
      (win.browserTabs ?? []).forEach((tab) => {
        if (tab.url && !byUrl.has(tab.url)) {
          byUrl.set(tab.url, {
            url: tab.url,
            title: tab.title ?? tab.url,
            favIconUrl: tab.favIconUrl ?? '',
            browserType: type,
          });
        }
      });
    });
  });
  return Array.from(byUrl.values());
});

typedIpcMain.handle('get-never-close-tabs', async () => {
  return await NeverCloseBrowserTab.getAll();
});

typedIpcMain.handle('add-never-close-tab', async (e, tab) => {
  const existing = await NeverCloseBrowserTab.findOneBy({ url: tab.url });
  if (existing) {
    existing.title = tab.title;
    existing.favIconUrl = tab.favIconUrl;
    existing.browserType = tab.browserType;
    await existing.save();
    return;
  }
  const entity = NeverCloseBrowserTab.create({
    url: tab.url,
    title: tab.title,
    favIconUrl: tab.favIconUrl,
    browserType: tab.browserType,
  });
  await entity.save();
  await UsageData.addEntry('add-never-close-tab', false, tab.url);
});

typedIpcMain.handle('remove-never-close-tab', async (e, id) => {
  const existing = await NeverCloseBrowserTab.findOneBy({ id });
  if (existing) await existing.remove();
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


