/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, March 2023
 */

import Snapshot from 'main/entity/Snapshot';
import Application from 'main/entity/Application';
import Browser from '../main/entity/Browser';
import IDE from '../main/entity/IDE';
import ExtensionsStatus from './ExtensionsStatus';
import KnownApplication from 'main/entity/KnownApplication';
import NeverCloseBrowserTab from 'main/entity/NeverCloseBrowserTab';
import UserSettings from './UserSettings';
import { StudyPhase } from './StudyPhase';
import { BrowserType } from './BrowserType';

// A currently-open browser tab, surfaced to the Settings page so the user can
// pick tabs to protect from closing.
export type OpenBrowserTab = {
  url: string;
  title: string;
  favIconUrl: string;
  browserType: BrowserType;
};

// Artefact-scoring weights (w1..w4 + lambda), editable from Study Settings.
export type ScoreWeightsDTO = {
  duration: number;
  frequency: number;
  recency: number;
  interaction: number;
  lambda: number;
  // Semantic influence α (multiplicative): 0 = off, 1 = full multiply.
  semantic: number;
};

// One vertical marker on the trim bar: when an artefact was first focused.
export type TimelineMarkerDTO = {
  t: number;
  key: string;
  kind: 'app' | 'ide' | 'tab' | 'file';
  // Icon (data URL or favicon URL) used to derive the marker's colour; may be
  // empty when the artefact has no icon.
  icon: string;
  label: string;
};

// A stretch where duration scoring was frozen (no activity past the idle
// timeout), drawn as a greyed band on the trim bar.
export type IdlePeriodDTO = { start: number; end: number };

export type StoppedTaskBundle = {
  taskId: number;
  taskName: string;
  browsers: Browser[];
  ides: IDE[];
  applications: Application[];
  previousKeys: string[];
  trackedKeys: string[];
  // Picker keys the scorer auto-selected (above the score threshold), incl.
  // parent rows for any selected leaf.
  autoSelectKeys: string[];
  // Wall-clock span of the just-stopped session — the trim bar's full range.
  sessionStartMs: number;
  sessionEndMs: number;
  // Trim-bar backdrop: artefact-introduction markers + idle (frozen) bands.
  markers: TimelineMarkerDTO[];
  idlePeriods: IdlePeriodDTO[];
};

export type TrimWindow = { startMs: number; endMs: number };

type Commands = {
  'get-snapshot-by-id': (id: number) => Snapshot | null;
  'get-latest-n-snapshots': (n: number) => Snapshot[];

  // subtasks (Phase 2)
  'get-snapshot-children': (parentId: number) => Promise<Snapshot[]>;
  'create-subtask': (parentId: number, name: string) => Promise<Snapshot>;
  'rename-snapshot': (snapshotId: number, name: string) => Promise<void>;
  'delete-snapshot': (snapshotId: number) => Promise<void>;

  // create new top-level task with selected currently-open artifacts (legacy)
  'get-currently-open-applications': () => Promise<
    [Browser[], IDE[], Application[]]
  >;
  'create-task': (
    name: string,
    browsers: Browser[],
    ides: IDE[],
    applications: Application[],
    parentId?: number | null
  ) => Promise<Snapshot>;

  // active-task session model
  'start-task': (
    name: string,
    parentId?: number | null,
    declutter?: boolean
  ) => Promise<Snapshot>;
  'resume-task': (taskId: number) => Promise<Snapshot>;
  'stop-task': () => Promise<StoppedTaskBundle | null>;
  // Re-score the just-stopped session over [startMs, endMs] (timeline trim).
  'simulate-trim': (
    startMs: number,
    endMs: number
  ) => Promise<StoppedTaskBundle | null>;
  'commit-task-artefacts': (
    taskId: number,
    browsers: Browser[],
    ides: IDE[],
    applications: Application[],
    trim?: TrimWindow
  ) => Promise<void>;
  'discard-active-task': () => Promise<void>;
  'get-active-task': () => Promise<{ id: number; name: string } | null>;

  // settings
  'get-extensions-status': () => ExtensionsStatus;
  'get-device-status': () => boolean;
  'get-known-applications': () => KnownApplication[];
  'update-known-application': (app: KnownApplication) => void;

  // never-close browser tabs
  'get-open-browser-tabs': () => Promise<OpenBrowserTab[]>;
  'get-never-close-tabs': () => Promise<NeverCloseBrowserTab[]>;
  'add-never-close-tab': (tab: OpenBrowserTab) => Promise<void>;
  'remove-never-close-tab': (id: number) => Promise<void>;
  'open-settings-window': () => void;
  'get-settings': () => Promise<UserSettings>;
  'set-settings': (settings: UserSettings) => void;

  // study data collection
  'export-study-data': () => Promise<{
    canceled: boolean;
    count: number;
    path: string | null;
  }>;
  'clear-study-data': () => Promise<{ cleared: number }>;

  // artefact-scoring weights (w1..w4 + lambda)
  'get-score-weights': () => Promise<ScoreWeightsDTO>;
  'set-score-weights': (
    weights: ScoreWeightsDTO
  ) => Promise<{ rescoredTasks: number }>;

  // questionnaires
  'get-study-phase': () => StudyPhase;
};

export default Commands;
