/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, March 2023
 */

import Snapshot from 'main/entity/Snapshot';
import Artifact from './Artifact';
import Browser from '../main/entity/Browser';
import BrowserTab from '../main/entity/BrowserTab';
import IDEFile from 'main/entity/IDEFile';
import IDE from '../main/entity/IDE';
import ExtensionsStatus from './ExtensionsStatus';
import KnownApplication from 'main/entity/KnownApplication';
import UserSettings from './UserSettings';
import { StudyPhase } from './StudyPhase';

type Commands = {
  'get-snapshot-by-id': (id: number) => Snapshot | null;
  'get-latest-snapshot': () => Snapshot | null;
  'get-latest-n-snapshots': (n: number) => Snapshot[];
  'open-artifact': (artifact: Artifact) => void;
  'open-all-artifacts-of-snapshot': (snapshot: Snapshot) => void;
  'delete-snapshot': (snapshotId: number) => Promise<void>;
  'save-snapshot': (snapshot: Snapshot) => Promise<void>;
  'save-snapshot-and-close-applications': (snapshot: Snapshot) => Promise<void>;
  'postpone-snapshot': (snapshot: Snapshot, timeInMin: number) => void;
  'merge-snapshots': (fromId: number, toId: number) => void;
  'get-merge-recommendations': () => Promise<Snapshot[]>;

  'open-browser-tab': (browser: Browser, tab: BrowserTab) => void;
  'open-ide-file': (ide: IDE, file: IDEFile) => void;
  'get-total-num-snapshots': () => number;

  // subtasks (Phase 2)
  'get-snapshot-children': (parentId: number) => Promise<Snapshot[]>;
  'create-subtask': (parentId: number, name: string) => Promise<Snapshot>;
  'rename-snapshot': (snapshotId: number, name: string) => Promise<void>;

  // settings
  'get-extensions-status': () => ExtensionsStatus;
  'get-device-status': () => boolean;
  'get-known-applications': () => KnownApplication[];
  'update-known-application': (app: KnownApplication) => void;
  'get-settings': () => Promise<UserSettings>;
  'set-settings': (settings: UserSettings) => void;

  // questionnaires
  'get-study-phase': () => StudyPhase;
};

export default Commands;
