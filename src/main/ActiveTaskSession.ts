/*
 * ActiveTaskSession
 * -----------------
 * Tracks the artefacts the user touches while a task is active. It records the
 * raw timeline of events (focus changes, interactions, passive activity) and
 * feeds them to a StatsAccumulator to derive per-artefact usage stats
 * (foreground duration, access count, interaction count, last access).
 *
 * Stats accumulate across sessions: previously-saved stats are loaded as
 * `_priorStats` and this session's contribution is added on top. The raw
 * timeline is kept after the task stops (as `_pending`) so the end-of-task
 * "trim the timeline" curation can re-score the session over any window; once
 * the user commits, the trimmed contribution is folded into the saved stats and
 * the temporary timeline is dropped.
 *
 * Fed by the trackers (WindowTracker -> ActiveArtifact.setCurrentWindow,
 * VSCodeTracker -> ActiveArtifact.setCurrentFile, InteractionTracker).
 */

import { info } from 'electron-log';
import { app as electronApp } from 'electron';
import ActiveWindowSample from '../../release/app/PA.WindowsActivityTracker/typescript/src/types/ActiveWindow';
import { ActiveFile } from 'types/ActiveFile';
import { BrowserType } from 'types/BrowserType';
import WindowManager from './WindowManager';
import Snapshot from './entity/Snapshot';
import ArtifactUsage, { ArtifactKind } from './entity/ArtifactUsage';
import ArtifactScorer, { ScoreInput } from './ArtifactScorer';
import KnownApplication from './entity/KnownApplication';
import NeverCloseBrowserTab from './entity/NeverCloseBrowserTab';
import { isBlankTab } from './helpers/isBlankTab';
import { UsageStat } from './scoring/StatsAccumulator';
import artefactText from './scoring/artefactText';
import SemanticScorer, { SemanticInput } from './scoring/SemanticScorer';
import {
  TLEvent,
  replay,
  mergeStats,
  analyzeTimeline,
  TimelineMarker,
  TimelineSegment,
  IdlePeriod,
} from './scoring/SessionTimeline';
import StaticSettings from './StaticSettings';

const fileIcon = require('extract-file-icon');

export type TrackedApp = {
  name: string;
  path: string;
  icon: string;
  title: string;
  lastSeen: number;
  score?: number;
  semanticScore?: number;
};

export type TrackedTab = {
  url: string;
  title: string;
  browserType: BrowserType;
  lastSeen: number;
  score?: number;
  semanticScore?: number;
};

export type TrackedFile = {
  path: string;
  lastSeen: number;
  score?: number;
  semanticScore?: number;
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
  /** When the task was set active — the default trim start + an indicator. */
  sessionStartMs: number;
  /** When the task ended — the default trim end. */
  sessionEndMs: number;
  /** Earliest the trim start can be pulled back to (2h / app start / prev task). */
  floorMs: number;
  /** Where the previous task ended (drawn as a boundary indicator), or 0. */
  lastTaskEndMs: number;
  /** How much pre-roll to reveal by default: min(duration/3, 15 min). */
  preRollMs: number;
  /** First-introduction markers + active segments + idle stretches (trim bar). */
  markers: TimelineMarker[];
  segments: TimelineSegment[];
  idlePeriods: IdlePeriod[];
};

type Meta = {
  apps: Map<string, TrackedApp>;
  ides: Map<string, TrackedApp>;
  browsers: Map<BrowserType, TrackedApp>;
  tabs: Map<string, TrackedTab>;
  files: Map<string, TrackedFile>;
};

/** Per-artefact scoring output: final score + semantic detail for persistence. */
type ScoredKey = {
  score: number;
  semanticSimilarity: number;
  semanticCosine: number | null;
  embedding: number[] | null;
  text: string;
};

type PendingSession = {
  taskId: number;
  taskName: string;
  priorStats: Map<string, UsageStat>;
  priorAccumulatedMs: number;
  // Ambient events over [floorMs, sessionEndMs] — includes time before the task
  // was activated, so the trim start can be pulled back into the pre-roll.
  events: TLEvent[];
  activeStartMs: number; // when the task was set active
  floorMs: number; // earliest the trim start can be extended to
  sessionEndMs: number;
  lastBoundaryMs: number; // where the previous task ended (indicator)
  meta: Meta;
};

// Ambient logging keeps the last 2h of events, which also caps how far a task's
// start can be pulled back (the "up to 2 hours" limit).
const MAX_PREROLL_MS = 2 * 60 * 60 * 1000;
// One "add more" click reveals another 15 min of pre-roll.
const PREROLL_SLOT_MS = 15 * 60 * 1000;

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

  // Accumulated stats from previous sessions (loaded; never mutated in place).
  private _priorStats: Map<string, UsageStat> = new Map();
  private _priorAccumulatedMs = 0;
  // Persisted embeddings per artefact key (+ the text they were computed from),
  // reused so semantic scoring only re-embeds when an artefact's text changes.
  private _priorEmbeddings: Map<string, { text: string; embedding: number[] }> =
    new Map();

  // Ambient event log — always recording (even with no active task) so a task's
  // window can be extended back before it was activated. Rolling 2h buffer.
  private _ambientEvents: TLEvent[] = [];
  private _pruneCounter = 0;
  // When logging started (app launch) and where the previous task ended. Both
  // floor how far back a task's start can be pulled.
  private _loggingStartMs = Date.now();
  private _prevBoundaryMs = Date.now();
  // When the current task was set active (0 when none).
  private _sessionStartMs = 0;

  // Just enough focus state to avoid recording duplicate focus events and to
  // attribute VS Code files / browser tabs to the frontmost window.
  private _focusKey: string | null = null;
  private _lastActiveFilePath: string | null = null;
  private _frontmostBrowserType: BrowserType | null = null;

  // The just-stopped session, kept so its timeline can be re-scored (trimmed)
  // until the user commits.
  private _pending: PendingSession | null = null;

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
    // Reset only per-task state — the ambient event log keeps running so this
    // task can later reach back into the time before it was activated.
    this.resetTaskState();
    await this.loadAccumulated(taskId);
    this._sessionStartMs = Date.now();
    this._activeTaskId = taskId;
    try {
      const snap = await Snapshot.findOneBy({ id: taskId });
      if (snap) {
        snap.lastStartTs = new Date(this._sessionStartMs).toISOString();
        await snap.save();
      }
    } catch {
      // best-effort
    }
    info(`[ActiveTaskSession] Started task ${taskId} "${taskName}"`);
    this.broadcastChange();
  }

  public async resume(taskId: number, taskName: string): Promise<void> {
    await this.start(taskId, taskName);
    info(`[ActiveTaskSession] Resumed task ${taskId} "${taskName}"`);
  }

  /**
   * Stop the active task: close the timeline, persist the full-session stats,
   * keep the session pending (for trimming), and return the scored artefacts.
   */
  public async stop(): Promise<StoppedSession | null> {
    if (this._activeTaskId === null) return null;
    const taskId = this._activeTaskId;
    const taskName = this._activeTaskName ?? `Task ${taskId}`;
    const now = Date.now();
    const activeStart = this._sessionStartMs;

    this.pruneAmbient(now);
    this._pending = this.buildPending(taskId, taskName, activeStart, now);

    // Persist + score the default (active-only) window up front so nothing is
    // lost even if the user never commits.
    const stopped = await this.buildAndPersist(
      this._pending,
      activeStart,
      now,
      /* persist */ true
    );

    info(
      `[ActiveTaskSession] Stopped task ${taskId} "${taskName}" — ${stopped.apps.length +
        stopped.ides.length +
        stopped.browsers.length +
        stopped.files.length} artefacts, ${stopped.autoSelectKeys.length} auto-selected`
    );

    // Clear the active task but KEEP the ambient log running for the next task.
    this._activeTaskId = null;
    this._activeTaskName = null;
    this._sessionStartMs = 0;
    this.broadcastChange();

    return stopped;
  }

  /** Snapshot the ambient log into a pending session for [floor, end]. */
  private buildPending(
    taskId: number,
    taskName: string,
    activeStart: number,
    end: number
  ): PendingSession {
    const floor = Math.min(activeStart, this.computeFloorMs(end));
    return {
      taskId,
      taskName,
      priorStats: this._priorStats,
      priorAccumulatedMs: this._priorAccumulatedMs,
      events: this._ambientEvents.filter((e) => e.t >= floor && e.t <= end),
      activeStartMs: activeStart,
      floorMs: floor,
      sessionEndMs: end,
      lastBoundaryMs: this._prevBoundaryMs,
      meta: this.snapshotMeta(),
    };
  }

  /**
   * Re-score the just-stopped session as if only [winStart, winEnd] happened.
   * Does NOT persist. Returns null when there is no pending session.
   */
  public async scoreWindow(
    winStart: number,
    winEnd: number
  ): Promise<StoppedSession | null> {
    if (!this._pending) return null;
    return this.buildAndPersist(this._pending, winStart, winEnd, false);
  }

  /**
   * Commit the chosen trim window: re-persist the session's stats over the
   * window and drop the pending timeline. Returns null when nothing is pending.
   */
  public async commitTrim(
    winStart: number,
    winEnd: number
  ): Promise<StoppedSession | null> {
    if (!this._pending) return null;
    const stopped = await this.buildAndPersist(
      this._pending,
      winStart,
      winEnd,
      true
    );
    // The committed end becomes the boundary the NEXT task can't reach before
    // (except into any time this task trimmed away — hence winEnd, not the
    // active-start). Time before winStart that this task gave up stays claimable.
    this._prevBoundaryMs = winEnd;
    this.clearPending();
    return stopped;
  }

  public clearPending(): void {
    this._pending = null;
  }

  /**
   * Cancel the picker after a stop: the default (active) window was already
   * persisted, so just record the task's end as the boundary for the next task
   * and drop the pending timeline.
   */
  public abandonPending(): void {
    if (this._pending) this._prevBoundaryMs = this._pending.sessionEndMs;
    this.clearPending();
  }

  /**
   * Stop tracking without surfacing a picker, but STILL persist the full
   * session's stats so its scoring isn't lost.
   */
  public async discard(): Promise<void> {
    if (this._activeTaskId === null) return;
    const taskId = this._activeTaskId;
    const now = Date.now();
    const activeStart = this._sessionStartMs;
    this.pruneAmbient(now);
    const pending = this.buildPending(
      taskId,
      this._activeTaskName ?? `Task ${taskId}`,
      activeStart,
      now
    );
    try {
      await this.buildAndPersist(pending, activeStart, now, true);
    } catch {
      // best-effort
    }
    this._prevBoundaryMs = now;
    info(`[ActiveTaskSession] Discarded active task ${taskId}`);
    this._activeTaskId = null;
    this._activeTaskName = null;
    this._sessionStartMs = 0;
    this.clearPending();
    this.broadcastChange();
  }

  // ---------- tracker hooks ----------

  /** Hook from ActiveArtifact.setCurrentWindow (records ambiently — always). */
  public onWindow(sample: ActiveWindowSample): void {
    const appName = sample.process;
    const appPath = sample.processPath;
    if (!appName || !appPath) return;
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
      let url = sample.url;
      let tabTitle = title;
      if (!url) {
        try {
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
        this.recordFocus(tabKey(url), 'tab');
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
      if (this._lastActiveFilePath && this._files.has(this._lastActiveFilePath)) {
        this.recordFocus(fileKey(this._lastActiveFilePath), 'file');
      } else {
        this.recordFocus(ideKey(appPath), 'ide');
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
    this.recordFocus(appKey(appPath), 'app');
  }

  /** Hook from BrowserTracker when the extension reports the active tab changed. */
  public onBrowserTabChange(
    type: BrowserType,
    url: string,
    title: string
  ): void {
    if (this._frontmostBrowserType !== type) return;
    if (!url || isBlankTab(url)) return;
    this._tabs.set(url, {
      url,
      title: title || url,
      browserType: type,
      lastSeen: Date.now(),
    });
    this.recordFocus(tabKey(url), 'tab');
  }

  /** Hook from VSCodeTracker -> ActiveArtifact.setCurrentFile */
  public onFile(file: ActiveFile): void {
    if (!file.path) return;
    this._files.set(file.path, { path: file.path, lastSeen: Date.now() });
    this._lastActiveFilePath = file.path;
    this.recordFocus(fileKey(file.path), 'file');
  }

  /** A click / keystroke happened (attributed to the focused artefact). */
  public onInteraction(): void {
    const t = Date.now();
    this._ambientEvents.push({ ty: 'i', t });
    this.maybePrune(t);
  }

  /** Passive activity (mouse-move / scroll) — keeps duration alive. */
  public onActivity(): void {
    const t = Date.now();
    this._ambientEvents.push({ ty: 'a', t });
    this.maybePrune(t);
  }

  private recordFocus(key: string, kind: ArtifactKind): void {
    if (this._focusKey === key) return;
    const t = Date.now();
    this._ambientEvents.push({ ty: 'f', t, key, kind });
    this._focusKey = key;
    this.maybePrune(t);
  }

  /** Drop ambient events / metadata older than the 2h retention window. */
  private maybePrune(now: number): void {
    this._pruneCounter += 1;
    if (this._pruneCounter % 256 !== 0) return;
    this.pruneAmbient(now);
  }

  private pruneAmbient(now: number): void {
    const cutoff = now - MAX_PREROLL_MS;
    let i = 0;
    while (
      i < this._ambientEvents.length &&
      this._ambientEvents[i].t < cutoff
    ) {
      i += 1;
    }
    if (i > 0) this._ambientEvents.splice(0, i);
    const pruneMeta = (m: Map<unknown, { lastSeen: number }>) => {
      for (const [k, v] of m) if (v.lastSeen < cutoff) m.delete(k);
    };
    pruneMeta(this._apps as Map<unknown, { lastSeen: number }>);
    pruneMeta(this._ides as Map<unknown, { lastSeen: number }>);
    pruneMeta(this._browsers as Map<unknown, { lastSeen: number }>);
    pruneMeta(this._tabs as Map<unknown, { lastSeen: number }>);
    pruneMeta(this._files as Map<unknown, { lastSeen: number }>);
  }

  private computeFloorMs(now: number): number {
    return Math.max(
      this._loggingStartMs,
      now - MAX_PREROLL_MS,
      this._prevBoundaryMs
    );
  }

  // ---------- scoring + persistence ----------

  /**
   * Re-score the session over [winStart, winEnd] from its raw timeline, build
   * the StoppedSession (artefacts annotated with scores), and optionally persist
   * the merged stats to ArtifactUsage + Snapshot.activeMs.
   */
  private async buildAndPersist(
    p: PendingSession,
    winStart: number,
    winEnd: number,
    persist: boolean
  ): Promise<StoppedSession> {
    const contribution = replay(p.events, winStart, winEnd);
    const merged = mergeStats(p.priorStats, contribution);
    const activeMs = p.priorAccumulatedMs + Math.max(0, winEnd - winStart);

    const scored = await this.scoreStats(merged, p.meta, activeMs);
    const scores = new Map<string, number>();
    const semantic = new Map<string, number>();
    // Only surface semantic scores when semantic is actually active (influence
    // > 0); when off, every similarity is a neutral 1 and would be noise.
    const showSemantic = StaticSettings.SCORE_SEMANTIC_INFLUENCE > 0;
    for (const [k, v] of scored) {
      scores.set(k, v.score);
      if (showSemantic) semantic.set(k, v.semanticSimilarity);
    }

    if (persist) {
      await this.persist(
        p.taskId,
        merged,
        scored,
        p.meta,
        activeMs,
        winStart,
        winEnd
      );
    }

    const stopped = this.buildStoppedSession(p, scores, semantic);
    stopped.accumulatedActiveMs = activeMs;
    stopped.stopMomentMs = winEnd;
    return stopped;
  }

  /**
   * Score the merged stats. Two passes: (1) the behavioral score
   * (duration/frequency/recency), then (2) the semantic multiplier — each
   * artefact's content similarity to a behavioral-weighted centroid of the
   * task. Returns the final score plus the semantic details + embedding so they
   * can be persisted / exported.
   */
  private async scoreStats(
    merged: Map<string, UsageStat>,
    meta: Meta,
    activeMs: number
  ): Promise<Map<string, ScoredKey>> {
    const isNeverCloseKey = await this.buildNeverCloseKeyPredicate(meta);
    let totalInteractions = 0;
    // The recency reference is the task's total active-time elapsed = the sum of
    // all (idle-capped) durations. Decaying back from here means idle time and
    // gaps between sessions never age recency.
    let nowActiveMs = 0;
    for (const [key, stat] of merged) {
      if (!isNeverCloseKey(key, stat)) totalInteractions += stat.interactionCount;
      nowActiveMs += stat.totalDurationMs;
    }

    // Pass 1: behavioral inputs + score + the text to embed.
    const inputs = new Map<string, ScoreInput>();
    const texts = new Map<string, string>();
    const behavioral = new Map<string, number>();
    for (const [key, stat] of merged) {
      const interactionShare =
        isNeverCloseKey(key, stat) || totalInteractions <= 0
          ? 0
          : stat.interactionCount / totalInteractions;
      const input: ScoreInput = {
        totalDurationMs: stat.totalDurationMs,
        accessCount: stat.accessCount,
        lastAccessMs: stat.lastAccessMs,
        lastAccessActiveMs: stat.lastAccessActiveMs,
        interactionShare,
      };
      inputs.set(key, input);
      behavioral.set(
        key,
        ArtifactScorer.behavioralScore(input, activeMs, nowActiveMs)
      );
      const m = this.metaForKey(key, stat.kind, meta);
      texts.set(
        key,
        artefactText({
          kind: stat.kind,
          name: m.name,
          path: m.path,
          url: m.url,
          title: m.title,
        })
      );
    }

    // Pass 2: semantic similarity, weighted by the behavioral score. Reuses a
    // persisted embedding when the artefact's text is unchanged.
    const semInputs: SemanticInput[] = [];
    for (const [key] of merged) {
      const text = texts.get(key) ?? '';
      const cached = this._priorEmbeddings.get(key);
      semInputs.push({
        key,
        text,
        weight: behavioral.get(key) ?? 0,
        cachedEmbedding:
          cached && cached.text === text ? cached.embedding : null,
      });
    }
    const semantic = await SemanticScorer.similarities(semInputs);

    // Combine: final = behavioral * semantic factor.
    const out = new Map<string, ScoredKey>();
    for (const [key, input] of inputs) {
      const sem = semantic.get(key);
      input.semanticSimilarity = sem?.similarity ?? 1;
      out.set(key, {
        score: ArtifactScorer.score(input, activeMs, nowActiveMs),
        semanticSimilarity: sem?.similarity ?? 1,
        semanticCosine: sem?.cosine ?? null,
        embedding: sem?.embedding ?? null,
        text: texts.get(key) ?? '',
      });
    }
    return out;
  }

  private buildStoppedSession(
    p: PendingSession,
    scores: Map<string, number>,
    semantic: Map<string, number>
  ): StoppedSession {
    const { meta } = p;
    const apps = Array.from(meta.apps.values())
      .map((a) => ({
        ...a,
        score: scores.get(appKey(a.path)) ?? 0,
        semanticScore: semantic.get(appKey(a.path)),
      }))
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    const ides = Array.from(meta.ides.values())
      .map((i) => ({
        ...i,
        score: scores.get(ideKey(i.path)) ?? 0,
        semanticScore: semantic.get(ideKey(i.path)),
      }))
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    const browsers = Array.from(meta.browsers.entries()).map(([type, app]) => ({
      type,
      app,
      tabs: Array.from(meta.tabs.values())
        .filter((t) => t.browserType === type)
        .map((t) => ({
          ...t,
          score: scores.get(tabKey(t.url)) ?? 0,
          semanticScore: semantic.get(tabKey(t.url)),
        }))
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0)),
    }));
    const files = Array.from(meta.files.values())
      .map((f) => ({
        ...f,
        score: scores.get(fileKey(f.path)) ?? 0,
        semanticScore: semantic.get(fileKey(f.path)),
      }))
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

    const autoSelectKeys = Array.from(
      ArtifactScorer.selectAboveThreshold(scores)
    );

    // The timeline backdrop spans the full extendable range [floor, end]
    // (independent of any trim window) so the brackets slide over a fixed set of
    // markers / segments / idle bands, including the pre-roll before activation.
    const { markers, segments, idlePeriods } = analyzeTimeline(
      p.events,
      p.floorMs,
      p.sessionEndMs,
      StaticSettings.DURATION_IDLE_TIMEOUT_MS
    );
    const preRollMs = Math.min(
      Math.max(0, p.sessionEndMs - p.activeStartMs) / 3,
      PREROLL_SLOT_MS
    );

    return {
      taskId: p.taskId,
      taskName: p.taskName,
      apps,
      ides,
      browsers,
      files,
      autoSelectKeys,
      accumulatedActiveMs: 0,
      stopMomentMs: p.sessionEndMs,
      sessionStartMs: p.activeStartMs,
      sessionEndMs: p.sessionEndMs,
      floorMs: p.floorMs,
      lastTaskEndMs:
        p.lastBoundaryMs > p.floorMs && p.lastBoundaryMs < p.activeStartMs
          ? p.lastBoundaryMs
          : 0,
      preRollMs,
      markers,
      segments,
      idlePeriods,
    };
  }

  private metaForKey(key: string, kind: ArtifactKind, meta: Meta) {
    if (kind === 'app') {
      const m = meta.apps.get(key.slice('app:'.length));
      return blankMeta({ name: m?.name, path: m?.path ?? key.slice('app:'.length), title: m?.title, icon: m?.icon });
    }
    if (kind === 'ide') {
      const m = meta.ides.get(key.slice('ide:'.length));
      return blankMeta({ name: m?.name, path: m?.path ?? key.slice('ide:'.length), title: m?.title, icon: m?.icon });
    }
    if (kind === 'tab') {
      const m = meta.tabs.get(key.slice('tab:'.length));
      return blankMeta({ url: m?.url ?? key.slice('tab:'.length), title: m?.title, browserType: m?.browserType });
    }
    const m = meta.files.get(key.slice('file:'.length));
    return blankMeta({ path: m?.path ?? key.slice('file:'.length) });
  }

  private async buildNeverCloseKeyPredicate(
    meta: Meta
  ): Promise<(key: string, stat: UsageStat) => boolean> {
    const neverCloseApps =
      await KnownApplication.getAppsThatShouldNeverBeClosed();
    const ncPaths = new Set(neverCloseApps.map((a) => a.path));
    const ncNames = new Set(neverCloseApps.map((a) => a.name.toLowerCase()));
    const ncTabUrls = await NeverCloseBrowserTab.getUrlSet();

    return (key: string, stat: UsageStat): boolean => {
      if (stat.kind === 'tab') return ncTabUrls.has(key.slice('tab:'.length));
      if (stat.kind === 'app' || stat.kind === 'ide') {
        const prefix = stat.kind === 'app' ? 'app:' : 'ide:';
        const path = key.slice(prefix.length);
        const m =
          stat.kind === 'app' ? meta.apps.get(path) : meta.ides.get(path);
        const name = m?.name?.toLowerCase();
        return ncPaths.has(path) || (name != null && ncNames.has(name));
      }
      return false;
    };
  }

  private async persist(
    taskId: number,
    merged: Map<string, UsageStat>,
    scored: Map<string, ScoredKey>,
    meta: Meta,
    activeMs: number,
    winStartMs: number,
    nowMs: number
  ): Promise<void> {
    const existingRows = await ArtifactUsage.getForSnapshot(taskId);
    const byKey = new Map(existingRows.map((r) => [r.key, r] as const));

    const toSave: ArtifactUsage[] = [];
    for (const [key, stat] of merged) {
      const m = this.metaForKey(key, stat.kind, meta);
      let row = byKey.get(key);
      if (!row) {
        row = ArtifactUsage.create({ snapshotId: taskId, key, kind: stat.kind });
      }
      row.kind = stat.kind;
      row.name = m.name;
      row.path = m.path;
      row.url = m.url;
      row.title = m.title;
      if (m.icon) row.icon = m.icon;
      row.browserType = m.browserType;
      row.totalDurationMs = stat.totalDurationMs;
      row.accessCount = stat.accessCount;
      row.interactionCount = stat.interactionCount;
      row.lastAccessTs = stat.lastAccessMs
        ? new Date(stat.lastAccessMs).toISOString()
        : '';
      row.lastAccessActiveMs = stat.lastAccessActiveMs ?? 0;
      const sk = scored.get(key);
      row.score = sk?.score ?? 0;
      row.semanticSimilarity = sk?.semanticSimilarity ?? 1;
      row.semanticCosine = sk?.semanticCosine ?? null!;
      if (sk?.embedding) {
        row.embedding = JSON.stringify(sk.embedding);
        row.embeddedText = sk.text;
        // Keep the in-memory cache in sync for the rest of this session.
        this._priorEmbeddings.set(key, {
          text: sk.text,
          embedding: sk.embedding,
        });
      }
      toSave.push(row);
    }
    if (toSave.length > 0) await ArtifactUsage.save(toSave);

    // Reconcile: drop rows for artefacts that fall outside the persisted window.
    // `merged` always contains every prior-activation key (mergeStats seeds from
    // prior), so any existing row absent from `merged` was introduced only
    // during the now-trimmed portion of this session and must not survive.
    const mergedKeys = new Set(merged.keys());
    const staleRows = existingRows.filter((r) => !mergedKeys.has(r.key));
    if (staleRows.length > 0) await ArtifactUsage.remove(staleRows);

    const snap = await Snapshot.findOneBy({ id: taskId });
    if (snap) {
      snap.activeMs = activeMs;
      snap.lastStartTs = new Date(winStartMs).toISOString();
      snap.lastStopTs = new Date(nowMs).toISOString();
      await snap.save();
    }
  }

  private async loadAccumulated(taskId: number): Promise<void> {
    const rows = await ArtifactUsage.getForSnapshot(taskId);
    for (const r of rows) {
      const lastSeen = r.lastAccessTs ? Date.parse(r.lastAccessTs) : 0;
      this._priorStats.set(r.key, {
        kind: r.kind,
        totalDurationMs: r.totalDurationMs ?? 0,
        accessCount: r.accessCount ?? 0,
        interactionCount: r.interactionCount ?? 0,
        lastAccessMs: Number.isNaN(lastSeen) ? 0 : lastSeen,
        lastAccessActiveMs: r.lastAccessActiveMs ?? 0,
      });
      if (r.embedding && r.embeddedText) {
        try {
          const vec = JSON.parse(r.embedding) as number[];
          if (Array.isArray(vec) && vec.length > 0) {
            this._priorEmbeddings.set(r.key, { text: r.embeddedText, embedding: vec });
          }
        } catch {
          // ignore malformed cached embedding
        }
      }
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
    this._priorAccumulatedMs = snap?.activeMs ?? 0;
  }

  private snapshotMeta(): Meta {
    return {
      apps: new Map(this._apps),
      ides: new Map(this._ides),
      browsers: new Map(this._browsers),
      tabs: new Map(this._tabs),
      files: new Map(this._files),
    };
  }

  private safeIcon(path: string): string {
    try {
      const buf = fileIcon(path, 16);
      return `data:image/png;base64,${Buffer.from(buf).toString('base64')}`;
    } catch {
      return '';
    }
  }

  // Reset only per-task accumulation. Ambient state (event log, metadata maps,
  // focus dedup) is intentionally preserved so the next task can reach back into
  // the time before it was activated.
  private resetTaskState(): void {
    this._priorStats = new Map();
    this._priorEmbeddings = new Map();
    this._priorAccumulatedMs = 0;
  }

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
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        require('./TrayManager').default.updateTray();
      } catch {
        // best-effort
      }
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

function blankMeta(o: {
  name?: string;
  path?: string;
  url?: string;
  title?: string;
  icon?: string;
  browserType?: string;
}) {
  return {
    name: o.name ?? '',
    path: o.path ?? '',
    url: o.url ?? '',
    title: o.title ?? '',
    icon: o.icon ?? '',
    favIconUrl: '',
    browserType: o.browserType ?? '',
  };
}
