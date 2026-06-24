/*
 * TaskRestorer
 * ------------
 * Restores a task's working context when the user switches TO an existing
 * task. "Restore" means:
 *   1. OPEN the artefacts saved on the task — regular applications (with their
 *      files), IDEs (with their open files / workspace), browser tabs, and
 *      file-explorer folders.
 *   2. CLOSE everything else that is currently open — other applications,
 *      browser tabs that don't belong to the task, and file-explorer windows
 *      whose folder isn't part of the task.
 *
 * Exceptions to closing (never touched):
 *   - applications the user marked "never close" in Settings
 *     (KnownApplication.neverClose),
 *   - the file explorer application itself (Finder / Windows Explorer) — only
 *     individual explorer *windows* are closed, never the app,
 *   - ContextShifter / Electron itself,
 *   - the browser applications the task uses (their *tabs* are managed, but the
 *     browser app is not quit).
 *
 * IMPORTANT: only call this for an EXISTING task that has saved artefacts.
 * Never call it for a brand-new empty task — with an empty keep-set it would
 * close the user's entire environment.
 */

import activeWin from 'active-win';
import { app } from 'electron';
import { info, error } from 'electron-log';
import Snapshot from './entity/Snapshot';
import KnownApplication from './entity/KnownApplication';
import NeverCloseBrowserTab from './entity/NeverCloseBrowserTab';
import BrowserTracker from './trackers/BrowserTracker';
import VSCodeTracker from './trackers/VSCodeTracker';
import UsageData from './entity/UsageData';
import ApplicationEntity from './entity/Application';
import IDEEntity from './entity/IDE';
import BrowserEntity from './entity/Browser';
import { BrowserType } from 'types/BrowserType';
import { CloseTabClientRequest } from '../types/context-browser-extension-types/types';
import {
  openArtifact,
  openFiles,
  closeApplication,
  getRunningApplications,
  getOpenFileExplorerPaths,
  closeFileExplorerPath,
} from './helpers/osCommands';

function isVSCodeIde(i: { name?: string; path?: string }): boolean {
  return /code/i.test(i.name ?? '') || /code/i.test(i.path ?? '');
}

function browserTypeFromName(name: string | undefined): BrowserType | null {
  if (!name) return null;
  const n = name.toLowerCase();
  if (n.includes('chrome')) return 'chrome';
  if (n.includes('firefox')) return 'firefox';
  if (n.includes('edge')) return 'edge';
  if (n.includes('safari')) return 'safari';
  return null;
}

function isFileExplorerName(name: string | undefined): boolean {
  if (!name) return false;
  return /finder|windows explorer|windows-explorer|explorer\.exe/i.test(name);
}

function selectedOnly<T extends { isSelected?: boolean }>(
  arr: T[] | undefined
): T[] {
  return (arr ?? []).filter((x) => x.isSelected !== false);
}

export default class TaskRestorer {
  /**
   * Open the task's artefacts and close everything else (subject to the
   * exceptions documented above). Never throws — failures are logged so task
   * activation is never blocked by a restore problem.
   */
  public static async restore(taskId: number): Promise<void> {
    try {
      const snap = await Snapshot.getSnapshotById(taskId);
      if (!snap) {
        error(`[TaskRestorer] Task ${taskId} not found; nothing to restore`);
        return;
      }
      info(`[TaskRestorer] Restoring task ${taskId} "${snap.name}"`);

      const taskApps = selectedOnly(snap.applications);
      const taskIdes = selectedOnly(snap.ides);
      const taskBrowsers = selectedOnly(snap.browsers);

      // Apps/IDEs/browsers this task wants open -> protect them from closing.
      const keepPaths = new Set<string>();
      const keepNames = new Set<string>();
      const addKeep = (name?: string, path?: string) => {
        if (path) keepPaths.add(path);
        if (name) keepNames.add(name.toLowerCase());
      };
      taskApps.forEach((a) => addKeep(a.name, a.path));
      taskIdes.forEach((i) => addKeep(i.name, i.path));
      taskBrowsers.forEach((b) => addKeep(b.name ?? undefined, b.path));

      // Browser types the task uses -> never quit those browser apps.
      const keepBrowserTypes = new Set<BrowserType>(
        taskBrowsers.map((b) => b.type)
      );

      // "Never close" apps from Settings.
      const neverClose = await KnownApplication.getAppsThatShouldNeverBeClosed();
      const neverClosePaths = new Set(neverClose.map((a) => a.path));
      const neverCloseNames = new Set(
        neverClose.map((a) => a.name.toLowerCase())
      );

      // 1) OPEN the task's artefacts.
      await this.openArtefacts(taskApps, taskIdes, taskBrowsers);

      // 2) CLOSE the rest. Order matters: the extension-driven closes (browser
      // tabs, VS Code files) are reliable and need no OS permission, so run
      // them first. The osascript-driven closes (Finder windows, quitting apps)
      // can be blocked by macOS Automation prompts, so run them last and
      // timeout-guarded — a hang there must not prevent the others.
      await this.closeOtherBrowserTabs(taskBrowsers);
      await this.closeOtherVSCodeFiles(taskIdes);
      await this.closeOtherFileExplorerWindows(taskApps);
      await this.closeOtherApplications(
        keepPaths,
        keepNames,
        keepBrowserTypes,
        neverClosePaths,
        neverCloseNames
      );

      snap.lastRestore = new Date().toISOString();
      await snap.save();
      await UsageData.addEntry('restore-snapshot', false, `id: ${taskId}`);
      info(`[TaskRestorer] Finished restoring task ${taskId}`);
    } catch (err) {
      error(`[TaskRestorer] Failed to restore task ${taskId}`, err);
    }
  }

  /**
   * Close every currently-open artefact (apps, browser tabs, VS Code files,
   * file-explorer windows) EXCEPT the never-close ones — a "clean slate" used by
   * "Declutter and start task". ContextShifter itself, the file explorer, and
   * never-close apps/tabs are preserved. Never throws.
   */
  public static async declutter(): Promise<void> {
    try {
      info('[TaskRestorer] Declutter: closing all non-protected artefacts');
      const neverClose =
        await KnownApplication.getAppsThatShouldNeverBeClosed();
      const neverClosePaths = new Set(neverClose.map((a) => a.path));
      const neverCloseNames = new Set(
        neverClose.map((a) => a.name.toLowerCase())
      );
      // Keep browsers that host a never-close tab, so quitting the app doesn't
      // kill a protected tab.
      let keepBrowserTypes = new Set<BrowserType>();
      try {
        const ncTabs = await NeverCloseBrowserTab.getAll();
        keepBrowserTypes = new Set(ncTabs.map((t) => t.browserType));
      } catch (err) {
        error('[TaskRestorer] Could not load never-close tabs', err);
      }

      // Empty task keep-sets => close everything except the protected items.
      await this.closeOtherBrowserTabs([]);
      await this.closeOtherVSCodeFiles([]);
      await this.closeOtherFileExplorerWindows([]);
      await this.closeOtherApplications(
        new Set<string>(),
        new Set<string>(),
        keepBrowserTypes,
        neverClosePaths,
        neverCloseNames
      );
      info('[TaskRestorer] Declutter finished');
    } catch (err) {
      error('[TaskRestorer] Declutter failed', err);
    }
  }

  // ---------------- OPEN ----------------

  private static async openArtefacts(
    taskApps: ApplicationEntity[],
    taskIdes: IDEEntity[],
    taskBrowsers: BrowserEntity[]
  ): Promise<void> {
    // Regular applications + file-explorer folders.
    for (const a of taskApps) {
      try {
        if (isFileExplorerName(a.name)) {
          // File-explorer "app" carries folders as its files. Open each folder.
          for (const f of a.files ?? []) {
            if (f.path) await openArtifact({ artifact: f.path });
          }
          continue;
        }
        const filePaths = (a.files ?? []).map((f) => f.path).filter(Boolean);
        if (filePaths.length > 0) {
          await openFiles({ application: a.path, artifact: filePaths });
        } else if (a.path) {
          await openArtifact({ artifact: a.path });
        }
      } catch (err) {
        error(`[TaskRestorer] Failed to open application "${a.name}"`, err);
      }
    }

    // IDEs: open the project folder (if it's part of the task) plus the saved
    // files, so the project comes back up the way it was — not just loose files.
    for (const i of taskIdes) {
      try {
        const targets: string[] = [];
        // The "Project Folder" sub-artefact: only reopen it if selected.
        if (i.workspacePath && i.workspaceSelected !== false) {
          targets.push(i.workspacePath);
        }
        (i.ideFiles ?? [])
          .filter((f) => f.isSelected !== false && !!f.path)
          .forEach((f) => targets.push(f.path));
        if (targets.length > 0) {
          // `open -a <IDE> <folder> <files...>` opens the folder as a workspace
          // window and the files within it.
          await openFiles({ application: i.path, artifact: targets });
        } else if (i.path) {
          await openArtifact({ artifact: i.path });
        }
      } catch (err) {
        error(`[TaskRestorer] Failed to open IDE "${i.name}"`, err);
      }
    }

    // Browser tabs: group the task's tabs by browser type and ask the
    // extension to (re)open them. No-op if the extension isn't connected.
    const urlsByType = new Map<BrowserType, string[]>();
    for (const b of taskBrowsers) {
      const urls = (b.browserTabs ?? [])
        .filter((t) => t.isSelected !== false && !!t.url)
        .map((t) => t.url);
      if (urls.length === 0) continue;
      const existing = urlsByType.get(b.type) ?? [];
      urlsByType.set(b.type, existing.concat(urls));
    }
    urlsByType.forEach((urls, type) => {
      try {
        BrowserTracker.getInstance().tabOpeningRequest(urls, type);
      } catch (err) {
        error(`[TaskRestorer] Failed to open tabs in ${type}`, err);
      }
    });
  }

  // ---------------- CLOSE ----------------

  private static async closeOtherApplications(
    keepPaths: Set<string>,
    keepNames: Set<string>,
    keepBrowserTypes: Set<BrowserType>,
    neverClosePaths: Set<string>,
    neverCloseNames: Set<string>
  ): Promise<void> {
    // Enumerate running apps via System Events (reliable; only needs the
    // Automation permission). Fall back to active-win if that yields nothing
    // (e.g. on a platform/permission where System Events is unavailable).
    let openApps: { name: string; path: string }[] = [];
    try {
      openApps = await getRunningApplications();
    } catch (err) {
      info(`[TaskRestorer] getRunningApplications failed: ${String(err)}`);
    }
    if (openApps.length === 0) {
      try {
        const windows = await Promise.race([
          activeWin.getOpenWindows().then((w) => w || []),
          new Promise<activeWin.Result[]>((_resolve, reject) =>
            setTimeout(() => reject(new Error('active-win timeout')), 5000)
          ),
        ]);
        openApps = windows.map((w) => ({
          name: w.owner?.name ?? '',
          path: w.owner?.path ?? '',
        }));
      } catch (err) {
        info(`[TaskRestorer] Could not enumerate open apps: ${String(err)}`);
        return;
      }
    }

    const selfName = app.getName().toLowerCase();
    // De-dupe by path so we issue at most one quit per application.
    const seen = new Set<string>();
    for (const a of openApps) {
      const name = a.name ?? '';
      const path = a.path ?? '';
      const lowerName = name.toLowerCase();
      const dedupeKey = path || lowerName;
      if (!dedupeKey || seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      // Protected: ourselves, the file explorer app, never-close list.
      if (
        lowerName === 'electron' ||
        lowerName === selfName ||
        lowerName === 'contextshifter'
      )
        continue;
      if (isFileExplorerName(name)) continue;
      if (neverClosePaths.has(path) || neverCloseNames.has(lowerName)) continue;

      // Part of the task -> keep open.
      if (keepPaths.has(path) || keepNames.has(lowerName)) continue;

      // Don't quit a browser whose tabs the task manages.
      const bt = browserTypeFromName(name);
      if (bt && keepBrowserTypes.has(bt)) continue;

      if (!path) continue;

      try {
        info(`[TaskRestorer] Closing application "${name}"`);
        closeApplication({ name, path } as ApplicationEntity);
      } catch (err) {
        error(`[TaskRestorer] Failed to close application "${name}"`, err);
      }
    }
  }

  /**
   * Close VS Code editor tabs that aren't part of the task. Uses the VS Code
   * extension's close-files endpoint (no OS permission needed). Files belonging
   * to the task are kept; everything else currently open is closed.
   */
  private static async closeOtherVSCodeFiles(
    taskIdes: IDEEntity[]
  ): Promise<void> {
    const vsIdes = taskIdes.filter(isVSCodeIde);
    // Files the task wants to keep open.
    const keepFiles = new Set<string>();
    vsIdes.forEach((i) =>
      (i.ideFiles ?? []).forEach((f) => {
        if (f.isSelected !== false && f.path) keepFiles.add(f.path);
      })
    );

    try {
      const snap = await VSCodeTracker.getInstance().requestVSCodeSnapshot();
      if (!snap) return;
      const toClose = (snap.openFiles ?? [])
        .map((f) => f.path)
        .filter((p) => p && !keepFiles.has(p));
      if (toClose.length > 0) {
        info(`[TaskRestorer] Closing ${toClose.length} VS Code file(s)`);
        await VSCodeTracker.getInstance().sendFileClosingRequest(toClose);
      }
    } catch (err) {
      error('[TaskRestorer] Failed to close VS Code files', err);
    }
  }

  private static async closeOtherBrowserTabs(
    taskBrowsers: BrowserEntity[]
  ): Promise<void> {
    // URLs the task wants kept, per browser type.
    const keepUrlsByType = new Map<BrowserType, Set<string>>();
    for (const b of taskBrowsers) {
      const set = keepUrlsByType.get(b.type) ?? new Set<string>();
      (b.browserTabs ?? []).forEach((t) => {
        if (t.url) set.add(t.url);
      });
      keepUrlsByType.set(b.type, set);
    }

    // URLs the user marked "never close" — protected regardless of task. These
    // apply across all browser types, so fold them into every type's keep set.
    let neverCloseUrls = new Set<string>();
    try {
      neverCloseUrls = await NeverCloseBrowserTab.getUrlSet();
    } catch (err) {
      error('[TaskRestorer] Could not load never-close tabs', err);
    }

    let liveBrowsers: Map<BrowserType, BrowserEntity[]>;
    try {
      liveBrowsers = BrowserTracker.getInstance().getSnapshotInformation();
    } catch (err) {
      error('[TaskRestorer] Could not read live browser tabs', err);
      return;
    }

    liveBrowsers.forEach((windows, type) => {
      const keepUrls = keepUrlsByType.get(type) ?? new Set<string>();
      const toClose: CloseTabClientRequest[] = [];
      windows.forEach((win) => {
        (win.browserTabs ?? []).forEach((tab) => {
          if (tab.url && !keepUrls.has(tab.url) && !neverCloseUrls.has(tab.url)) {
            toClose.push({ url: tab.url, windowId: win.windowId });
          }
        });
      });
      if (toClose.length > 0) {
        try {
          info(
            `[TaskRestorer] Closing ${toClose.length} tab(s) in ${type}`
          );
          BrowserTracker.getInstance().sendTabClosingRequest(type, toClose);
        } catch (err) {
          error(`[TaskRestorer] Failed to close tabs in ${type}`, err);
        }
      }
    });
  }

  private static async closeOtherFileExplorerWindows(
    taskApps: ApplicationEntity[]
  ): Promise<void> {
    // Folders the task wants kept (from any file-explorer artefacts).
    const keepFolders = new Set<string>();
    taskApps
      .filter((a) => isFileExplorerName(a.name))
      .forEach((a) =>
        (a.files ?? []).forEach((f) => {
          if (f.path) keepFolders.add(f.path);
        })
      );

    let openPaths: string[] = [];
    try {
      openPaths = await Promise.race([
        getOpenFileExplorerPaths(),
        new Promise<string[]>((_resolve, reject) =>
          setTimeout(() => reject(new Error('explorer enum timeout')), 5000)
        ),
      ]);
    } catch (err) {
      info(`[TaskRestorer] Could not enumerate explorer windows: ${String(err)}`);
      return;
    }

    for (const p of openPaths) {
      if (keepFolders.has(p)) continue;
      try {
        info(`[TaskRestorer] Closing file-explorer window "${p}"`);
        await closeFileExplorerPath(p);
      } catch (err) {
        error(`[TaskRestorer] Failed to close explorer window "${p}"`, err);
      }
    }
  }
}
