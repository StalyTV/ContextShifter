/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, March 2023
 */

import Snapshot from 'main/entity/Snapshot';
import Artifact from './Artifact';

type Commands = {
  'get-snapshot-by-id': (id: number) => Snapshot | null;
  'get-latest-snapshot': () => Snapshot | null;
  'get-latest-n-snapshots': (n: number) => Snapshot[];
  'get-used-applications': () => string[];
  'open-artifact': (artifact: Artifact) => void;
  'save-snapshot': (snapshot: Snapshot) => Promise<void>;
  'save-snapshot-and-close-applications': (snapshot: Snapshot) => Promise<void>;
  'postpone-snapshot': (snapshot: Snapshot, timeInMin: number) => void;
  'toggle-color-theme': () => void;

  // instant curation
  'instant-curation-curate-now': (snapshotId: number, name: string) => void;
  'instant-curation-postpone': (
    snapshotId: number,
    updatedName: string,
    timeInMin: number
  ) => void;

  // snapshot gallery
  'open-snapshot': (snapshotId: number) => void;
};

export default Commands;
