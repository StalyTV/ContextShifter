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

type Commands = {
  'get-snapshot-by-id': (id: number) => Snapshot | null;
  'get-latest-snapshot': () => Snapshot | null;
  'get-latest-n-snapshots': (n: number) => Snapshot[];
  'open-artifact': (artifact: Artifact) => void;
  'open-all-artifacts-of-snapshot': (snapshot: Snapshot) => void;
  'save-snapshot': (snapshot: Snapshot) => Promise<void>;
  'save-snapshot-and-close-applications': (snapshot: Snapshot) => Promise<void>;
  'postpone-snapshot': (snapshot: Snapshot, timeInMin: number) => void;
  'toggle-color-theme': () => void;
  'is-dark-mode-enabled': () => boolean;

  // instant curation
  'instant-curation-curate-now': (snapshotId: number, name: string) => void;
  'instant-curation-postpone': (
    snapshotId: number,
    updatedName: string,
    timeInMin: number
  ) => void;

  // snapshot gallery
  'open-snapshot': (snapshotId: number) => void;
  'delete-snapshot': (snapshotId: number) => Promise<void>;
  'restore-snapshot': (snapshotId: number) => void;
  'expand-snapshot-preview': (snapshotId: number) => void;
  'open-browser-tab': (browser: Browser, tab: BrowserTab) => void;
  'open-ide-file': (ide: IDE, file: IDEFile) => void;

  // settings
  'get-extensions-status': () => ExtensionsStatus;
  'get-device-status': () => boolean;
  'open-config': () => void;
  'get-known-applications': () => KnownApplication[];
  'update-known-application': (app: KnownApplication) => void;
};

export default Commands;
