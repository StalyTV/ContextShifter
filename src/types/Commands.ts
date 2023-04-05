/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, March 2023
 */

import Snapshot from 'main/entity/Snapshot';
import Artifact from './Artifact';

type Commands = {
  'get-latest-snapshot': () => Snapshot | null;
  'get-used-applications': () => string[];
  'open-artifact': (artifact: Artifact) => void;
  'save-snapshot': (snapshot: Snapshot) => Promise<void>;
  'save-snapshot-and-close-applications': (snapshot: Snapshot) => Promise<void>;
  'postpone-snapshot': (snapshotId: number, timeInMin: number) => void;
  'toggle-color-theme': () => void;

  // instant curation
  'instant-curation-curate-now': (snapshotId: number, name: string) => void;
  'instant-curation-postpone': (snapshotId: number, name: string) => void;
};

export default Commands;
