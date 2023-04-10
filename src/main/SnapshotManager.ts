/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, March 2023
 */

import TaskSnap from './TaskSnap';
import Snapshot from './entity/Snapshot';
import Application from './entity/Application';
import File from './entity/File';
import BrowserEntity from './entity/Browser';
import BrowserTabEntity from './entity/BrowserTab';
import { info } from 'electron-log';
import { closeApplication } from './helpers/osCommands';
import WindowManager from './WindowManager';

export default class SnapshotManager {
  private static _instance: SnapshotManager;
  private _postponeTimeoutRef: NodeJS.Timeout | undefined;

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

      for (const browser of updatedSnapshot.browsers) {
        const browserInDb = await BrowserEntity.findOneBy({ id: browser.id });
        if (browserInDb && browserInDb.isSelected !== browser.isSelected) {
          browserInDb.isSelected = browser.isSelected;
          browserInDb.save();
        }

        for (const tab of browser.browserTabs) {
          const tabInDb = await BrowserTabEntity.findOneBy({ id: tab.id });
          if (tabInDb && tabInDb.isSelected !== tab.isSelected) {
            tabInDb.isSelected = tab.isSelected;
            tabInDb.save();
          }
        }
      }

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

    const tabsToClose: BrowserTabEntity[] = [];
    for (const browser of updatedSnapshot.browsers) {
      for (const tab of browser.browserTabs) {
        if (tab.isSelected) {
          tabsToClose.push(tab);
        }
      }
    }

    TaskSnap.getInstance().closeBrowserTabs(tabsToClose);

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

  public async postponeSnapshot(snapshotId: number, timeInMin: number) {
    this._postponeTimeoutRef = setTimeout(async () => {
      await WindowManager.createSnapshotWindow();
      this.resetTimeout();
    }, timeInMin * 60 * 1000);
    info(
      `[SnapshotManager] Postponed snapshot with id ${snapshotId} for ${timeInMin} minutes`
    );
  }

  private resetTimeout(): void {
    if (this._postponeTimeoutRef) {
      clearTimeout(this._postponeTimeoutRef);
      this._postponeTimeoutRef = undefined;
    }
  }
}
