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
import UserSettings from './UserSettings';
import { StudyPhase } from './StudyPhase';

export type StoppedTaskBundle = {
  taskId: number;
  taskName: string;
  browsers: Browser[];
  ides: IDE[];
  applications: Application[];
  previousKeys: string[];
  trackedKeys: string[];
};

type Commands = {
  'get-snapshot-by-id': (id: number) => Snapshot | null;
  'get-latest-n-snapshots': (n: number) => Snapshot[];

  // subtasks (Phase 2)
  'get-snapshot-children': (parentId: number) => Promise<Snapshot[]>;
  'create-subtask': (parentId: number, name: string) => Promise<Snapshot>;
  'rename-snapshot': (snapshotId: number, name: string) => Promise<void>;

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
  'start-task': (name: string, parentId?: number | null) => Promise<Snapshot>;
  'resume-task': (taskId: number) => Promise<Snapshot>;
  'stop-task': () => Promise<StoppedTaskBundle | null>;
  'commit-task-artefacts': (
    taskId: number,
    browsers: Browser[],
    ides: IDE[],
    applications: Application[]
  ) => Promise<void>;
  'discard-active-task': () => Promise<void>;
  'get-active-task': () => Promise<{ id: number; name: string } | null>;

  // settings
  'get-extensions-status': () => ExtensionsStatus;
  'get-device-status': () => boolean;
  'get-known-applications': () => KnownApplication[];
  'update-known-application': (app: KnownApplication) => void;
  'open-settings-window': () => void;
  'get-settings': () => Promise<UserSettings>;
  'set-settings': (settings: UserSettings) => void;

  // questionnaires
  'get-study-phase': () => StudyPhase;
};

export default Commands;
