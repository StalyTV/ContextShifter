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
import IDEEntity from './entity/IDE';
import IDEFileEntity from './entity/IDEFile';
import { info } from 'electron-log';
import { closeApplication } from './helpers/osCommands';
import WindowManager from './WindowManager';
import { TypedWebContents } from './ipc/types/electron-typed-ipc';
import Events from 'types/Events';
import UsageData from './entity/UsageData';
import KnownApplication from './entity/KnownApplication';

export default class SnapshotManager {
  private static _instance: SnapshotManager;
  private _postponeTimeoutRef: NodeJS.Timeout | undefined;

  public static getInstance() {
    return this._instance || (this._instance = new this());
  }

  public async getSnapshotById(id: number) {
    return await Snapshot.getSnapshotById(id);
  }

  public async getLatestSnapshot() {
    return await Snapshot.getLatestSnapshot();
  }

  public async getLatestNSnapshots(n: number) {
    return await Snapshot.getLatestNSnapshots(n);
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

      for (const ide of updatedSnapshot.ides) {
        const ideInDb = await IDEEntity.findOneBy({ id: ide.id });
        if (ideInDb && ideInDb.isSelected !== ide.isSelected) {
          ideInDb.isSelected = ide.isSelected;
          ideInDb.save();
        }

        for (const file of ide.ideFiles) {
          const fileInDb = await IDEFileEntity.findOneBy({ id: file.id });
          if (fileInDb && fileInDb.isSelected !== file.isSelected) {
            fileInDb.isSelected = file.isSelected;
            fileInDb.save();
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

      // update snapshot gallery window
      this.updateSnapshotGalleryWindow();
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

    const appsThatShouldNeverBeClosed =
      await KnownApplication.getAppsThatShouldNeverBeClosed();
    for (const app of updatedSnapshot.applications) {
      const doNotCloseThisApp = appsThatShouldNeverBeClosed.some(
        (notCloseApp) => {
          return notCloseApp.path === app.path;
        }
      );
      if (app.isSelected && !doNotCloseThisApp) {
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

  public async deleteSnapshot(snapshotId: number) {
    const snapshotInDb = await Snapshot.findOneBy({ id: snapshotId });
    if (snapshotInDb) {
      snapshotInDb.remove();
      info`[SnapshotManager] Deleted snapshot "${snapshotInDb.name}"`;
    }
  }

  public async postponeSnapshot(
    snapshotId: number,
    timeInMin: number,
    origin: string
  ) {
    this._postponeTimeoutRef = setTimeout(async () => {
      await this.openSnapshotInSnapshotWindow(snapshotId);
      this.resetTimeout();
    }, timeInMin * 60 * 1000);
    info(
      `[SnapshotManager] Postponed snapshot with id ${snapshotId} for ${timeInMin} minutes`
    );
    await UsageData.addEntry(
      'postpone-snapshot',
      false,
      `id: ${snapshotId}, time: ${timeInMin}, origin: ${origin}`
    );
  }

  public async openSnapshotInSnapshotWindow(snapshotId: number) {
    if (!WindowManager.snapshotWindow) {
      await WindowManager.createSnapshotWindow(() => {
        const destination = WindowManager.snapshotWindow
          ?.webContents as TypedWebContents<Events>;
        destination?.send('snapshot-selected', snapshotId);
      });
    } else {
      WindowManager.snapshotWindow.show();
      const destination = WindowManager.snapshotWindow
        .webContents as TypedWebContents<Events>;
      destination?.send('snapshot-selected', snapshotId);
    }
  }

  private resetTimeout(): void {
    if (this._postponeTimeoutRef) {
      clearTimeout(this._postponeTimeoutRef);
      this._postponeTimeoutRef = undefined;
    }
  }

  public updateSnapshotGalleryWindow(): void {
    if (WindowManager.snapshotGalleryWindow) {
      const destination = WindowManager.snapshotGalleryWindow
        .webContents as TypedWebContents<Events>;
      destination?.send('snapshots-updated');
    }
  }
}
