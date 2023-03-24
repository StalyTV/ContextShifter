/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, March 2023
 */

import Snapshot from './entity/Snapshot';

export default class SnapshotManager {
  private static _instance: SnapshotManager;

  public static getInstance() {
    return this._instance || (this._instance = new this());
  }

  public async getLatestSnapshot() {
    return await Snapshot.getLatestSnapshot();
  }
}
