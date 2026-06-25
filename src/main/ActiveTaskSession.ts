/*
 * ActiveTaskSession
 * -----------------
 * Tracks the artefacts the user touches while a task is active AND accumulates
 * per-artefact usage stats (foreground duration, distinct access count, last
 * access) so they can be scored. Stats are persisted to ArtifactUsage when the
 * task stops being active and reloaded when it becomes active again, so scoring
 * CONTINUES across multiple sessions of the same task. Only the currently
 * active task's stats are ever mutated, so other tasks are unaffected.
 *
 * Fed by the existing trackers (WindowTracker -> ActiveArtifact.setCurrentWindow,
 * VSCodeTracker -> ActiveArtifact.setCurrentFile).
 */

import { info } from 'electron-log';
import { app as electronApp } from 'electron';
import ActiveWindowSample from '../../release/app/PA.WindowsActivityTracker/typescript/src/types/ActiveWindow';
import { ActiveFile } from 'types/ActiveFile';
import { BrowserType } from 'types/BrowserType';
import WindowManager from './WindowManager';
import Snapshot from './entity/Snapshot';
import ArtifactUsage, { ArtifactKind } from './entity/ArtifactUsage';
import ArtifactScorer from './ArtifactScorer';
import StaticSettings from './StaticSettings';
import KnownApplication from './entity/KnownApplication';
import NeverCloseBrowserTab from './entity/NeverCloseBrowserTab';
import { isBlankTab } from './helpers/isBlankTab';

const fileIcon = require('extract-file-icon');

export type TrackedApp = {
  name: string;
  path: string;
  icon: string;
  title: string;
  lastSeen: number;
  score?: number;
};

export type TrackedTab = {
  url: string;
  title: string;
  browserType: BrowserType;
  lastSeen: number;
  score?: number;
};

export type TrackedFile = {
  path: string;
  lastSeen: number;
  score?: number;
};

type UsageStat = {
  kind: ArtifactKind;
  totalDurationMs: number;
  accessCount: number;
  interactionCount: number;
  lastAccessMs: number;
};

export type StoppedSession = {
  taskId: number;
  taskName: string;
  apps: TrackedApp[];
  ides: TrackedApp[];
  browsers: Array<{ type: BrowserType; app: TrackedApp; tabs: TrackedTab[] }>;
  files: TrackedFile[];
  /** Unified artefact keys (app:/ide:/tab:/file:) selected by the scorer. */
  autoSelectKeys: string[];
  accumulatedActiveMs: number;
  stopMomentMs: number;
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

// Stable unified artefact keys.
const appKey = (path: string) => `app:${path}`;
const ideKey = (path: string) => `ide:${path}`;
const tabKey = (url: string) => `tab:${url}`;
const fileKey = (path: string) => `file:${path}`;

export default class ActiveTaskSession {
  private static _instance: ActiveTaskSession;

  private _activeTaskId: number | null = null;
  private _activeTaskName: string | null = null;

  // Metadata maps (for rendering picker rows).
  private _apps: Map<string, TrackedApp> = new Map(); // by path
  private _ides: Map<string, TrackedApp> = new Map(); // by path
  private _browsers: Map<BrowserType, TrackedApp> = new Map(); // by type
  private _tabs: Map<string, TrackedTab> = new Map(); // by url
  private _files: Map<string, TrackedFile> = new Map(); // by path

  // Accumulated usage stats, keyed by unified artefact key.
  private _stats: Map<string, UsageStat> = new Map();

  // Accumulated active time across all sessions of the current task.
  private _accumulatedActiveMs = 0;
  private _sessionStart = 0;

  // Current-focus tracking, to attribute foreground duration.
  private _focusKey: string | null = null;
  private _focusStart = 0;
  // Idle-aware duration: only count time up to (last activity + idle timeout).
  // _lastActivityMs is the time of the last interaction (or the focus start);
  // _lastAccruedMs is how far we've already credited duration for this focus.
  private _lastActivityMs = 0;
  private _lastAccruedMs = 0;
  private _lastActiveFilePath: string | null = null;
  // Which browser (if any) is currently the frontmost app, so tab-switch events
  // from the extension are only counted while that browser is focused.
  private _frontmostBrowserType: BrowserType | null = null;

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

  public async start(taskId: number, taskName: string): Promise<void> {
    this._activeTaskName = taskName;
    this.resetSession();
    await this.loadAccumulated(taskId);
    this._sessionStart = Date.now();
    this._activeTaskId = taskId;
    // Record when this active session started (for study data start->stop time).
    try {
      const snap = await Snapshot.findOneBy({ id: taskId });
      if (snap) {
        snap.lastStartTs = new Date(this._sessionStart).toISOString();
        await snap.save();
      }
    } catch {
      // best-effort
    }
    info(`[ActiveTaskSession] Started task ${taskId} "${taskName}"`);
    this.broadcastChange();
  }

  /**
   * Make a task active again, continuing its accumulated scoring.
   */
  public async resume(taskId: number, taskName: string): Promise<void> {
    // resume is identical to start now: both reload accumulated stats so
    // scoring continues across sessions.
    await this.start(taskId, taskName);
    info(`[ActiveTaskSession] Resumed task ${taskId} "${taskName}"`);
  }

  /**
   * Stop the active task: accrue final focus, persist accumulated stats, and
   * return the artefacts (each annotated with its score) plus the keys the
   * scorer auto-selected. Returns null when no task is active.
   */
  public async stop(): Promise<StoppedSession | null> {
    if (this._activeTaskId === null) return null;
    const taskId = this._activeTaskId;
    const taskName = this._activeTaskName ?? `Task ${taskId}`;
    const now = Date.now();

    this.accrueFocus(now);
    this._accumulatedActiveMs += Math.max(0, now - this._sessionStart);

    const scores = await this.persist(taskId, now);
    const accumulatedActiveMs = this._accumulatedActiveMs;

    const apps = Array.from(this._apps.values())
      .map((a) => ({ ...a, score: scores.get(appKey(a.path)) ?? 0 }))
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    const ides = Array.from(this._ides.values())
      .map((i) => ({ ...i, score: scores.get(ideKey(i.path)) ?? 0 }))
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    const browsers = Array.from(this._browsers.entries()).map(([type, app]) => ({
      type,
      app,
      tabs: Array.from(this._tabs.values())
        .filter((t) => t.browserType === type)
        .map((t) => ({ ...t, score: scores.get(tabKey(t.url)) ?? 0 }))
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0)),
    }));
    const files = Array.from(this._files.values())
      .map((f) => ({ ...f, score: scores.get(fileKey(f.path)) ?? 0 }))
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

    const autoSelectKeys = Array.from(
      ArtifactScorer.selectAboveThreshold(scores)
    );

    info(
      `[ActiveTaskSession] Stopped task ${taskId} "${taskName}" — ${this._stats.size} artefacts, ${autoSelectKeys.length} auto-selected, activeMs=${accumulatedActiveMs}`
    );

    this._activeTaskId = null;
    this._activeTaskName = null;
    this.resetSession();
    this.broadcastChange();

    return {
      taskId,
      taskName,
      apps,
      ides,
      browsers,
      files,
      autoSelectKeys,
      accumulatedActiveMs,
      stopMomentMs: now,
    };
  }

  /**
   * Stop tracking without surfacing a picker, but STILL persist accumulated
   * stats so a session's scoring isn't lost.
   */
  public async discard(): Promise<void> {
    if (this._activeTaskId === null) return;
    const taskId = this._activeTaskId;
    const now = Date.now();
    this.accrueFocus(now);
    this._accumulatedActiveMs += Math.max(0, now - this._sessionStart);
    try {
      await this.persist(taskId, now);
    } catch {
      // best-effort
    }
    info(`[ActiveTaskSession] Discarded active task ${taskId}`);
    this._activeTaskId = null;
    this._activeTaskName = null;
    this.resetSession();
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
      this._frontmostBrowserType = browserType;
      const existing = this._browsers.get(browserType);
      this._browsers.set(browserType, {
        name: appName,
        path: appPath,
        icon: existing?.icon ?? this.safeIcon(appPath),
        title,
        lastSeen: now,
      });
      // Prefer active-win's URL; on macOS it's usually absent (needs Screen
      // Recording), so fall back to the active tab the browser extension
      // reports. This is what makes browser-tab time actually get scored.
      let url = sample.url;
      let tabTitle = title;
      if (!url) {
        try {
          // Lazy require avoids an import cycle with BrowserTracker.
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const BrowserTracker = require('./trackers/BrowserTracker').default;
          const at = BrowserTracker.getInstance().getActiveTab(browserType);
          if (at?.url) {
            url = at.url;
            tabTitle = at.title || title;
          }
        } catch {
          // best-effort
        }
      }
      if (url && !isBlankTab(url)) {
        this._tabs.set(url, { url, title: tabTitle, browserType, lastSeen: now });
        this.switchFocus(tabKey(url), 'tab');
      }
      return;
    }
    this._frontmostBrowserType = null;

    if (isVSCodeName(appName)) {
      const existing = this._ides.get(appPath);
      this._ides.set(appPath, {
        name: appName,
        path: appPath,
        icon: existing?.icon ?? this.safeIcon(appPath),
        title,
        lastSeen: now,
      });
      // Attribute focus to the current file when known, else to the IDE itself.
      if (this._lastActiveFilePath && this._files.has(this._lastActiveFilePath)) {
        this.switchFocus(fileKey(this._lastActiveFilePath), 'file');
      } else {
        this.switchFocus(ideKey(appPath), 'ide');
      }
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
    this.switchFocus(appKey(appPath), 'app');
  }

  /**
   * Hook from BrowserTracker when the extension reports the active tab changed.
   * Only counts while that browser is the frontmost app (so background tab
   * updates from another browser don't steal focus time).
   */
  public onBrowserTabChange(
    type: BrowserType,
    url: string,
    title: string
  ): void {
    if (this._activeTaskId === null) return;
    if (this._frontmostBrowserType !== type) return;
    if (!url || isBlankTab(url)) return;
    this._tabs.set(url, {
      url,
      title: title || url,
      browserType: type,
      lastSeen: Date.now(),
    });
    this.switchFocus(tabKey(url), 'tab');
  }

  /** Hook from VSCodeTracker -> ActiveArtifact.setCurrentFile */
  public onFile(file: ActiveFile): void {
    if (this._activeTaskId === null) return;
    if (!file.path) return;
    this._files.set(file.path, { path: file.path, lastSeen: Date.now() });
    this._lastActiveFilePath = file.path;
    this.switchFocus(fileKey(file.path), 'file');
  }

  // ---------- focus / stats ----------

  private switchFocus(key: string, kind: ArtifactKind): void {
    const now = Date.now();
    if (this._focusKey === key) return;
    // End the previous visit: accrue its duration and, if it was long enough,
    // count it as an access / refresh its recency (see closeCurrentVisit).
    this.closeCurrentVisit(now);
    this._focusKey = key;
    this._focusStart = now;
    // Focusing an artefact counts as activity that seeds the duration grace.
    this._lastActivityMs = now;
    this._lastAccruedMs = now;
    let s = this._stats.get(key);
    if (!s) {
      s = {
        kind,
        totalDurationMs: 0,
        accessCount: 0,
        interactionCount: 0,
        // 0 = "never meaningfully accessed". Recency is only refreshed once a
        // visit lasts >= MIN_RECENCY_ACCESS_MS or an interaction happens, so a
        // brief accidental focus doesn't grant a full recency score.
        lastAccessMs: 0,
      };
      this._stats.set(key, s);
    }
    // Neither accessCount nor lastAccessMs is updated here: both are only
    // applied when the visit ends and is found to have lasted long enough
    // (see closeCurrentVisit). Interactions refresh recency immediately.
  }

  /**
   * Credit the focused artefact with active foreground time up to NOW, but only
   * as far as (last activity + idle timeout). Time spent with no interaction
   * beyond the grace period is not counted, so an artefact left open while the
   * user is away stops accumulating duration.
   */
  private flushActiveDuration(now: number): void {
    if (!this._focusKey) return;
    const s = this._stats.get(this._focusKey);
    if (!s) return;
    const activeUntil =
      this._lastActivityMs + StaticSettings.DURATION_IDLE_TIMEOUT_MS;
    const accrueTo = Math.min(now, activeUntil);
    if (accrueTo > this._lastAccruedMs) {
      s.totalDurationMs += accrueTo - this._lastAccruedMs;
      this._lastAccruedMs = accrueTo;
    }
  }

  /**
   * End the current focus visit: accrue its (idle-capped) foreground duration,
   * count it as an "access" toward the frequency score ONLY if it lasted at
   * least MIN_QUALIFYING_ACCESS_MS, and refresh its recency ONLY if it lasted at
   * least MIN_RECENCY_ACCESS_MS. This keeps brief, accidental focus from
   * inflating the access count or granting a full recency score.
   */
  private closeCurrentVisit(now: number): void {
    if (!this._focusKey) return;
    const prev = this._stats.get(this._focusKey);
    if (!prev) return;
    this.flushActiveDuration(now);
    const visitMs = Math.max(0, now - this._focusStart);
    if (visitMs >= StaticSettings.MIN_QUALIFYING_ACCESS_MS) {
      prev.accessCount += 1;
    }
    if (visitMs >= StaticSettings.MIN_RECENCY_ACCESS_MS) {
      // Last meaningful access = the last activity in this visit (interaction,
      // scroll/move, or the focus itself), never beyond it.
      prev.lastAccessMs = Math.max(prev.lastAccessMs, this._lastActivityMs);
    }
  }

  /**
   * Mark user activity on the focused artefact: credit active time up to now
   * (capping any idle gap that just ended), then resume counting from now.
   */
  private markActivity(now: number): void {
    this.flushActiveDuration(now);
    this._lastActivityMs = now;
    this._lastAccruedMs = now;
  }

  /**
   * Hook from the global input tracker: a click or keystroke happened. Attribute
   * it to the currently focused artefact (if any) while a task is active. This
   * also marks activity, so duration resumes counting after an idle gap.
   */
  public onInteraction(): void {
    if (this._activeTaskId === null) return;
    if (!this._focusKey) return;
    const s = this._stats.get(this._focusKey);
    if (!s) return;
    const now = Date.now();
    this.markActivity(now);
    s.interactionCount += 1;
    s.lastAccessMs = now;
  }

  /**
   * Hook from the global input tracker: passive activity (mouse movement or
   * scrolling). It keeps the focused artefact's duration alive — breaking the
   * idle timeout — but is NOT counted as an interaction in the interaction
   * score (only clicks and keystrokes are).
   */
  public onActivity(): void {
    if (this._activeTaskId === null) return;
    if (!this._focusKey) return;
    this.markActivity(Date.now());
  }

  private accrueFocus(now: number): void {
    this.closeCurrentVisit(now);
    this._focusKey = null;
    this._focusStart = now;
  }

  // ---------- persistence ----------

  private metaForKey(key: string, stat: UsageStat) {
    if (stat.kind === 'app') {
      const m = this._apps.get(key.slice('app:'.length));
      return {
        name: m?.name ?? '',
        path: m?.path ?? key.slice('app:'.length),
        url: '',
        title: m?.title ?? '',
        icon: m?.icon ?? '',
        favIconUrl: '',
        browserType: '',
      };
    }
    if (stat.kind === 'ide') {
      const m = this._ides.get(key.slice('ide:'.length));
      return {
        name: m?.name ?? '',
        path: m?.path ?? key.slice('ide:'.length),
        url: '',
        title: m?.title ?? '',
        icon: m?.icon ?? '',
        favIconUrl: '',
        browserType: '',
      };
    }
    if (stat.kind === 'tab') {
      const m = this._tabs.get(key.slice('tab:'.length));
      return {
        name: '',
        path: '',
        url: m?.url ?? key.slice('tab:'.length),
        title: m?.title ?? '',
        icon: '',
        favIconUrl: '',
        browserType: m?.browserType ?? '',
      };
    }
    // file
    const m = this._files.get(key.slice('file:'.length));
    return {
      name: '',
      path: m?.path ?? key.slice('file:'.length),
      url: '',
      title: '',
      icon: '',
      favIconUrl: '',
      browserType: '',
    };
  }

  /**
   * Build a predicate that tells whether an artefact key refers to a
   * "never close" app / IDE / browser tab. Those are excluded from the
   * interaction-share denominator (and get a 0 share).
   */
  private async buildNeverCloseKeyPredicate(): Promise<
    (key: string, stat: UsageStat) => boolean
  > {
    const neverCloseApps =
      await KnownApplication.getAppsThatShouldNeverBeClosed();
    const ncPaths = new Set(neverCloseApps.map((a) => a.path));
    const ncNames = new Set(neverCloseApps.map((a) => a.name.toLowerCase()));
    const ncTabUrls = await NeverCloseBrowserTab.getUrlSet();

    return (key: string, stat: UsageStat): boolean => {
      if (stat.kind === 'tab') {
        return ncTabUrls.has(key.slice('tab:'.length));
      }
      if (stat.kind === 'app' || stat.kind === 'ide') {
        const prefix = stat.kind === 'app' ? 'app:' : 'ide:';
        const path = key.slice(prefix.length);
        const meta =
          stat.kind === 'app' ? this._apps.get(path) : this._ides.get(path);
        const name = meta?.name?.toLowerCase();
        return ncPaths.has(path) || (name != null && ncNames.has(name));
      }
      return false;
    };
  }

  /**
   * Compute scores and upsert ArtifactUsage rows + Snapshot.activeMs.
   * Returns key -> score.
   */
  private async persist(
    taskId: number,
    nowMs: number
  ): Promise<Map<string, number>> {
    const scores = new Map<string, number>();
    const existingRows = await ArtifactUsage.getForSnapshot(taskId);
    const byKey = new Map(existingRows.map((r) => [r.key, r] as const));

    // Interaction share is relative to all tracked artefacts EXCEPT never-close
    // ones, so build the never-close key predicate and the total up front.
    const isNeverCloseKey = await this.buildNeverCloseKeyPredicate();
    let totalInteractions = 0;
    for (const [key, stat] of this._stats) {
      if (!isNeverCloseKey(key, stat)) totalInteractions += stat.interactionCount;
    }

    const toSave: ArtifactUsage[] = [];
    for (const [key, stat] of this._stats) {
      // Each artefact's share of the (non-never-close) interaction total, [0,1].
      const interactionShare =
        isNeverCloseKey(key, stat) || totalInteractions <= 0
          ? 0
          : stat.interactionCount / totalInteractions;

      const score = ArtifactScorer.score(
        {
          totalDurationMs: stat.totalDurationMs,
          accessCount: stat.accessCount,
          lastAccessMs: stat.lastAccessMs,
          interactionShare,
        },
        this._accumulatedActiveMs,
        nowMs
      );
      scores.set(key, score);

      const meta = this.metaForKey(key, stat);
      let row = byKey.get(key);
      if (!row) {
        row = ArtifactUsage.create({ snapshotId: taskId, key, kind: stat.kind });
      }
      row.kind = stat.kind;
      row.name = meta.name;
      row.path = meta.path;
      row.url = meta.url;
      row.title = meta.title;
      if (meta.icon) row.icon = meta.icon;
      if (meta.favIconUrl) row.favIconUrl = meta.favIconUrl;
      row.browserType = meta.browserType;
      row.totalDurationMs = stat.totalDurationMs;
      row.accessCount = stat.accessCount;
      row.interactionCount = stat.interactionCount;
      row.lastAccessTs = stat.lastAccessMs
        ? new Date(stat.lastAccessMs).toISOString()
        : '';
      row.score = score;
      toSave.push(row);
    }
    if (toSave.length > 0) await ArtifactUsage.save(toSave);

    const snap = await Snapshot.findOneBy({ id: taskId });
    if (snap) {
      snap.activeMs = this._accumulatedActiveMs;
      snap.lastStopTs = new Date(nowMs).toISOString();
      await snap.save();
    }
    return scores;
  }

  private async loadAccumulated(taskId: number): Promise<void> {
    const rows = await ArtifactUsage.getForSnapshot(taskId);
    for (const r of rows) {
      const lastSeen = r.lastAccessTs ? Date.parse(r.lastAccessTs) : 0;
      this._stats.set(r.key, {
        kind: r.kind,
        totalDurationMs: r.totalDurationMs ?? 0,
        accessCount: r.accessCount ?? 0,
        interactionCount: r.interactionCount ?? 0,
        lastAccessMs: Number.isNaN(lastSeen) ? 0 : lastSeen,
      });
      if (r.kind === 'app') {
        this._apps.set(r.path, {
          name: r.name ?? r.path,
          path: r.path,
          icon: r.icon ?? '',
          title: r.title ?? '',
          lastSeen,
        });
      } else if (r.kind === 'ide') {
        this._ides.set(r.path, {
          name: r.name ?? r.path,
          path: r.path,
          icon: r.icon ?? '',
          title: r.title ?? '',
          lastSeen,
        });
      } else if (r.kind === 'tab') {
        const type = (r.browserType || 'chrome') as BrowserType;
        this._tabs.set(r.url, {
          url: r.url,
          title: r.title ?? '',
          browserType: type,
          lastSeen,
        });
        if (!this._browsers.has(type)) {
          this._browsers.set(type, {
            name: type,
            path: '',
            icon: '',
            title: type,
            lastSeen,
          });
        }
      } else if (r.kind === 'file') {
        this._files.set(r.path, { path: r.path, lastSeen });
      }
    }
    const snap = await Snapshot.findOneBy({ id: taskId });
    this._accumulatedActiveMs = snap?.activeMs ?? 0;
  }

  private safeIcon(path: string): string {
    try {
      const buf = fileIcon(path, 16);
      return `data:image/png;base64,${Buffer.from(buf).toString('base64')}`;
    } catch {
      return '';
    }
  }

  private resetSession(): void {
    this._apps.clear();
    this._ides.clear();
    this._browsers.clear();
    this._tabs.clear();
    this._files.clear();
    this._stats.clear();
    this._accumulatedActiveMs = 0;
    this._sessionStart = Date.now();
    this._focusKey = null;
    this._focusStart = 0;
    this._lastActivityMs = 0;
    this._lastAccruedMs = 0;
    this._lastActiveFilePath = null;
    this._frontmostBrowserType = null;
  }

  /**
   * Notify the main window so the active-task UI can update without polling.
   */
  private async broadcastChange(): Promise<void> {
    try {
      let payload: { id: number; name: string } | null = null;
      if (this._activeTaskId !== null) {
        const snap = await Snapshot.findOneBy({ id: this._activeTaskId });
        if (snap) payload = { id: snap.id, name: snap.name };
        else
          payload = {
            id: this._activeTaskId,
            name: this._activeTaskName ?? `Task ${this._activeTaskId}`,
          };
      }
      WindowManager.mainWindow?.webContents.send('active-task-changed', payload);
      // Refresh the tray so Create/Stop Task enable-state tracks the active task.
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        require('./TrayManager').default.updateTray();
      } catch {
        // best-effort
      }
      // Light the physical button while a task is active (off otherwise).
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        require('./HID/TimeBuzzerManager').default
          .getInstance()
          .updateActiveIndicator();
      } catch {
        // best-effort
      }
    } catch {
      // best-effort
    }
  }
}
