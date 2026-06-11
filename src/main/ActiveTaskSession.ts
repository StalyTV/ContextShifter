/*
 * ActiveTaskSession
 * -----------------
 * Holds the in-memory buffer of artefacts the user has touched while a task
 * is active. The active-task id itself lives on TaskManager; this module is
 * fed by the existing trackers (WindowTracker -> ActiveArtifact.setCurrentWindow,
 * VSCodeTracker -> ActiveArtifact.setCurrentFile) and surfaces the buffered
 * artefacts at stop / commit time.
 *
 * The buffer is intentionally small and serialisable: per-app entries hold
 * just enough to render a picker row (name, path, icon, last-seen) without
 * having to re-enumerate windows via active-win on macOS, which is
 * unreliable without Screen Recording permission.
 */

import { info } from 'electron-log';
import { app as electronApp } from 'electron';
import ActiveWindowSample from '../../release/app/PA.WindowsActivityTracker/typescript/src/types/ActiveWindow';
import { ActiveFile } from 'types/ActiveFile';
import { BrowserType } from 'types/BrowserType';
import WindowManager from './WindowManager';
import Snapshot from './entity/Snapshot';

const fileIcon = require('extract-file-icon');

export type TrackedApp = {
  name: string;
  path: string;
  icon: string;
  title: string;
  lastSeen: number;
};

export type TrackedTab = {
  url: string;
  title: string;
  browserType: BrowserType;
  lastSeen: number;
};

export type TrackedFile = {
  path: string;
  lastSeen: number;
};

const BROWSER_NAME_TO_TYPE: Array<{ test: RegExp; type: BrowserType }> = [
  { test: /chrome/i, type: 'chrome' },
  { test: /firefox/i, type: 'firefox' },
  { test: /edge/i, type: 'edge' },
  { test: /safari/i, type: 'safari' },
];

function classifyBrowser(appName: string | undefined): BrowserType | null {
  if (!appName) return null;
  for (const { test, type } of BROWSER_NAME_TO_TYPE) {
    if (test.test(appName)) return type;
  }
  return null;
}

function isVSCodeName(name: string | undefined): boolean {
  if (!name) return false;
  return /^(code|visual studio code)/i.test(name);
}

export default class ActiveTaskSession {
  private static _instance: ActiveTaskSession;

  private _activeTaskId: number | null = null;
  private _activeTaskName: string | null = null;
  private _startedAt: number | null = null;

  // Keyed by application path so the same app focused twice collapses to one row.
  private _apps: Map<string, TrackedApp> = new Map();
  private _ides: Map<string, TrackedApp> = new Map();
  private _browsers: Map<BrowserType, TrackedApp> = new Map();
  private _tabs: Map<string, TrackedTab> = new Map(); // keyed by url
  private _files: Map<string, TrackedFile> = new Map(); // keyed by path

  private constructor() {}

  public static getInstance() {
    return this._instance || (this._instance = new this());
  }

  public getActiveTaskId(): number | null {
    return this._activeTaskId;
  }

  public getActiveTaskName(): string | null {
    return this._activeTaskName;
  }

  public isActive(): boolean {
    return this._activeTaskId !== null;
  }

  public start(taskId: number, taskName: string): void {
    this._activeTaskId = taskId;
    this._activeTaskName = taskName;
    this._startedAt = Date.now();
    this.clearBuffer();
    info(`[ActiveTaskSession] Started task ${taskId} "${taskName}"`);
    this.broadcastChange();
  }

  /**
   * Replace the active-task pointer without clearing the buffer. Useful when
   * a user picks a task to "resume" — we want the next stop to commit the
   * artefacts they touched during the resume session.
   */
  public resume(taskId: number, taskName: string): void {
    this._activeTaskId = taskId;
    this._activeTaskName = taskName;
    this._startedAt = Date.now();
    this.clearBuffer();
    info(`[ActiveTaskSession] Resumed task ${taskId} "${taskName}"`);
    this.broadcastChange();
  }

  /**
   * Returns the buffered artefacts and clears the active-task pointer.
   * The caller is responsible for committing the user's chosen subset.
   */
  public stop(): {
    taskId: number;
    taskName: string;
    apps: TrackedApp[];
    ides: TrackedApp[];
    browsers: Array<{ type: BrowserType; app: TrackedApp; tabs: TrackedTab[] }>;
    files: TrackedFile[];
  } | null {
    if (this._activeTaskId === null) return null;
    const taskId = this._activeTaskId;
    const taskName = this._activeTaskName ?? `Task ${taskId}`;
    const apps = Array.from(this._apps.values()).sort(
      (a, b) => b.lastSeen - a.lastSeen
    );
    const ides = Array.from(this._ides.values()).sort(
      (a, b) => b.lastSeen - a.lastSeen
    );
    const browsers = Array.from(this._browsers.entries()).map(
      ([type, app]) => ({
        type,
        app,
        tabs: Array.from(this._tabs.values())
          .filter((t) => t.browserType === type)
          .sort((a, b) => b.lastSeen - a.lastSeen),
      })
    );
    const files = Array.from(this._files.values()).sort(
      (a, b) => b.lastSeen - a.lastSeen
    );
    info(
      `[ActiveTaskSession] Stopped task ${taskId} "${taskName}" with ${apps.length} apps / ${ides.length} ides / ${browsers.length} browsers / ${this._tabs.size} tabs / ${files.length} files`
    );
    this._activeTaskId = null;
    this._activeTaskName = null;
    this._startedAt = null;
    this.clearBuffer();
    this.broadcastChange();
    return { taskId, taskName, apps, ides, browsers, files };
  }

  /** Forget the buffer + active pointer without surfacing anything. */
  public discard(): void {
    if (this._activeTaskId === null) return;
    info(`[ActiveTaskSession] Discarded active task ${this._activeTaskId}`);
    this._activeTaskId = null;
    this._activeTaskName = null;
    this._startedAt = null;
    this.clearBuffer();
    this.broadcastChange();
  }

  /** Hook from ActiveArtifact.setCurrentWindow */
  public onWindow(sample: ActiveWindowSample): void {
    if (this._activeTaskId === null) return;
    const appName = sample.process;
    const appPath = sample.processPath;
    if (!appName || !appPath) return;
    // Skip our own process so users don't end up tracking ContextShifter itself.
    if (appName === 'Electron' || appName === electronApp.getName()) return;

    const now = Date.now();
    const title = sample.windowTitle ?? appName;

    const browserType = classifyBrowser(appName);
    if (browserType) {
      const existing = this._browsers.get(browserType);
      this._browsers.set(browserType, {
        name: appName,
        path: appPath,
        icon: existing?.icon ?? this.safeIcon(appPath),
        title,
        lastSeen: now,
      });
      // The macOS active-win backend surfaces the active tab's URL on the
      // ActiveWindow sample. Record it as a touched tab.
      if (sample.url) {
        this._tabs.set(sample.url, {
          url: sample.url,
          title,
          browserType,
          lastSeen: now,
        });
      }
      return;
    }

    if (isVSCodeName(appName)) {
      const existing = this._ides.get(appPath);
      this._ides.set(appPath, {
        name: appName,
        path: appPath,
        icon: existing?.icon ?? this.safeIcon(appPath),
        title,
        lastSeen: now,
      });
      return;
    }

    const existing = this._apps.get(appPath);
    this._apps.set(appPath, {
      name: appName,
      path: appPath,
      icon: existing?.icon ?? this.safeIcon(appPath),
      title,
      lastSeen: now,
    });
  }

  /** Hook from VSCodeTracker -> ActiveArtifact.setCurrentFile */
  public onFile(file: ActiveFile): void {
    if (this._activeTaskId === null) return;
    if (!file.path) return;
    this._files.set(file.path, { path: file.path, lastSeen: Date.now() });
  }

  private safeIcon(path: string): string {
    try {
      const buf = fileIcon(path, 16);
      return `data:image/png;base64,${Buffer.from(buf).toString('base64')}`;
    } catch {
      return '';
    }
  }

  private clearBuffer(): void {
    this._apps.clear();
    this._ides.clear();
    this._browsers.clear();
    this._tabs.clear();
    this._files.clear();
  }

  /**
   * Notify the main window so the active-task UI (TaskList button label,
   * pinned active row) can update without polling. The widget gets the same
   * info via TaskManager's existing task-switcher-state broadcast.
   */
  private async broadcastChange(): Promise<void> {
    try {
      let payload: { id: number; name: string } | null = null;
      if (this._activeTaskId !== null) {
        const snap = await Snapshot.findOneBy({ id: this._activeTaskId });
        if (snap) payload = { id: snap.id, name: snap.name };
        else payload = { id: this._activeTaskId, name: this._activeTaskName ?? `Task ${this._activeTaskId}` };
      }
      WindowManager.mainWindow?.webContents.send(
        'active-task-changed',
        payload
      );
    } catch {
      // best-effort
    }
  }
}
