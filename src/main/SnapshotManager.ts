/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, March 2023
 */

import Snapshot from './entity/Snapshot';
import Application from './entity/Application';
import File from './entity/File';
import { info } from 'electron-log';
import { closeApplication } from './helpers/osCommands';

export default class SnapshotManager {
  private static _instance: SnapshotManager;

  public static getInstance() {
    return this._instance || (this._instance = new this());
  }

  public async getLatestSnapshot() {
    return await Snapshot.getLatestSnapshot();
  }

  public async saveSnapshot(updatedSnapshot: Snapshot) {
    const snapshotInDb = await Snapshot.findOneBy({ id: updatedSnapshot.id });
    if (snapshotInDb) {
      snapshotInDb.name = updatedSnapshot.name;
      snapshotInDb.summary = updatedSnapshot.summary;
      snapshotInDb.intent = updatedSnapshot.intent;
      snapshotInDb.edited = new Date().toISOString();

      for (const app of updatedSnapshot.applications) {
        const appInDb = await Application.findOneBy({ id: app.id });
        if (appInDb && appInDb.isSelected !== app.isSelected) {
          appInDb.isSelected = app.isSelected;
          appInDb.save();
        }

        for (const file of app.files) {
          const fileInDb = await File.findOneBy({ id: file.id });
          if (fileInDb && fileInDb.isSelected !== file.isSelected) {
            fileInDb.isSelected = file.isSelected;
            fileInDb.save();
          }
        }
      }

      await snapshotInDb.save();
      info(`[SnapshotManager] Updated snapshot "${snapshotInDb.name}"`);
    }
  }

  public async saveAndCloseApplications(updatedSnapshot: Snapshot) {
    await this.saveSnapshot(updatedSnapshot);
    for (const app of updatedSnapshot.applications) {
      if (app.isSelected) {
        closeApplication(app);
      }
    }
  }

  public async updateSnapshotName(snapshotId: number, name: string) {
    const snapshotInDb = await Snapshot.findOneBy({ id: snapshotId });
    if (snapshotInDb) {
      snapshotInDb.name = name;
      snapshotInDb.edited = new Date().toISOString();
      snapshotInDb.save();
    }
  }
}
