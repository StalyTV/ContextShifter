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
  "toggle-color-theme": () => void;
};

export default Commands;
