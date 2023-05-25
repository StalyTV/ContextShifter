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
import { closeApplication, closeFileExplorerPath } from './helpers/osCommands';
import WindowManager from './WindowManager';
import { TypedWebContents } from './ipc/types/electron-typed-ipc';
import Events from 'types/Events';
import UsageData from './entity/UsageData';
import KnownApplication from './entity/KnownApplication';
import TrayManager from './TrayManager';

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
      const timestamp = new Date().toISOString();
      snapshotInDb.name = updatedSnapshot.name;
      snapshotInDb.summary = updatedSnapshot.summary;
      snapshotInDb.intent = updatedSnapshot.intent;
      snapshotInDb.edited = timestamp;
      snapshotInDb.lastChange = timestamp;

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

      // update tray
      await TrayManager.updateTray();
    }
  }

  public async saveAndCloseApplications(updatedSnapshot: Snapshot) {
    await this.saveSnapshot(updatedSnapshot);

    const appsThatShouldNeverBeClosed =
      await KnownApplication.getAppsThatShouldNeverBeClosed();

    for (const browser of updatedSnapshot.browsers) {
      const tabsToClose: BrowserTabEntity[] = [];

      for (const tab of browser.browserTabs) {
        if (tab.isSelected) {
          tabsToClose.push(tab);
        }
      }
      TaskSnap.getInstance().closeBrowserTabs(browser, tabsToClose);
      // if all tabs were closed, quit browser
      if (browser.browserTabs.length === tabsToClose.length) {
        const doNotCloseThisApp = appsThatShouldNeverBeClosed.some(
          (notCloseApp) => {
            return notCloseApp.path === browser.path;
          }
        );
        if (browser.isSelected && !doNotCloseThisApp) {
          closeApplication(browser);
        }
      }
    }

    for (const ide of updatedSnapshot.ides) {
      const ideFilesToClose: IDEFileEntity[] = [];

      for (const file of ide.ideFiles) {
        if (file.isSelected) {
          ideFilesToClose.push(file);
        }
      }
      TaskSnap.getInstance().closeIDEFiles(ideFilesToClose);
      // if all files were closed, quit IDE
      if (ide.ideFiles.length === ideFilesToClose.length) {
        const doNotCloseThisApp = appsThatShouldNeverBeClosed.some(
          (notCloseApp) => {
            return notCloseApp.path === ide.path;
          }
        );
        if (ide.isSelected && !doNotCloseThisApp) {
          closeApplication(ide);
        }
      }
    }

    for (const app of updatedSnapshot.applications) {
      const filesToClose: File[] = [];

      for (const file of app.files) {
        if (file.isSelected) {
          filesToClose.push(file);
        }
      }

      // we are only able to close specific windows / tabs of the Finder / Explorer
      if (app.name === 'Finder' || app.name === 'Windows Explorer') {
        for await (const folder of filesToClose) {
          await closeFileExplorerPath(folder.path);
        }
      }

      const doNotCloseThisApp = appsThatShouldNeverBeClosed.some(
        (notCloseApp) => {
          return notCloseApp.path === app.path;
        }
      );

      if (
        app.isSelected &&
        filesToClose.length === app.files.length &&
        !doNotCloseThisApp
      ) {
        closeApplication(app);
      }
    }
  }

  public async updateSnapshotName(snapshotId: number, name: string) {
    const snapshotInDb = await Snapshot.findOneBy({ id: snapshotId });
    if (snapshotInDb) {
      snapshotInDb.name = name;
      await snapshotInDb.save();

      // update tray
      await TrayManager.updateTray();
    }
  }

  public async deleteSnapshot(snapshotId: number, origin: string) {
    await UsageData.addEntry(
      'delete-snapshot',
      false,
      `id: ${snapshotId}, origin: ${origin}`
    );
    const snapshotInDb = await Snapshot.findOneBy({ id: snapshotId });
    if (snapshotInDb) {
      await snapshotInDb.remove();
      info(`[SnapshotManager] Deleted snapshot "${snapshotInDb.name}"`);

      // update tray
      await TrayManager.updateTray();
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

  public async mergeSnapshots(fromSnap: Snapshot, toSnap: Snapshot) {
    if (fromSnap.summary) {
      toSnap.summary =
        fromSnap.summary + (toSnap.summary ? '\n\n' + toSnap.summary : ''); // new summary should be before old summary
    }
    if (fromSnap.intent) {
      toSnap.intent =
        fromSnap.intent + (toSnap.intent ? '\n\n' + toSnap.intent : '');
    }
    for await (const fromBrowser of fromSnap.browsers) {
      const toBrowser = toSnap.browsers.find(
        (toBrowser) => fromBrowser.type == toBrowser.type
      );
      if (toBrowser) {
        for await (const fromTab of fromBrowser.browserTabs) {
          const toTab = toBrowser.browserTabs.find(
            (toTab) => fromTab.url == toTab.url
          );
          if (toTab) {
            toTab.isActive = fromTab.isActive;
            toTab.isSelected = fromTab.isSelected;
            await toTab.save();
          } else {
            fromTab.browser = toBrowser;
            toBrowser.browserTabs.push(fromTab);
            await toBrowser.save();
          }
        }
      } else {
        fromBrowser.snapshot = toSnap;
        toSnap.browsers.push(fromBrowser);
        await toSnap.save();
      }
    }

    for await (const fromIDE of fromSnap.ides) {
      const toIDE = toSnap.ides.find((toIDE) => fromIDE.path == toIDE.path);
      if (toIDE) {
        for await (const fromFile of fromIDE.ideFiles) {
          const toFile = toIDE.ideFiles.find(
            (toFile) => fromFile.path == toFile.path
          );
          if (toFile) {
            toFile.isActive = fromFile.isActive;
            toFile.isSelected = fromFile.isSelected;
            await toFile.save();
          } else {
            fromFile.ide = toIDE;
            toIDE.ideFiles.push(fromFile);
            await toIDE.save();
          }
        }
      } else {
        fromIDE.snapshot = toSnap;
        toSnap.ides.push(fromIDE);
        await toSnap.save();
      }
    }

    for await (const fromApp of fromSnap.applications) {
      const toApp = toSnap.applications.find(
        (toApp) => fromApp.path == toApp.path
      );
      if (toApp) {
        for await (const fromFile of fromApp.files) {
          const toFile = toApp.files.find(
            (toFile) => fromFile.path == toFile.path
          );
          if (toFile) {
            toFile.isSelected = fromFile.isSelected;
            await toFile.save();
          } else {
            fromFile.application = toApp;
            toApp.files.push(fromFile);
            await toApp.save();
          }
        }
      } else {
        fromApp.snapshot = toSnap;
        toSnap.applications.push(fromApp);
        await toSnap.save();
      }
    }

    const timestamp = new Date().toISOString();
    fromSnap.isArchived = true;
    fromSnap.edited = timestamp;
    fromSnap.lastChange = timestamp;
    fromSnap.save();

    toSnap.edited = timestamp;
    toSnap.lastChange = timestamp;
    toSnap.save();

    await UsageData.addEntry(
      'merge-snapshots',
      false,
      `fromId: ${fromSnap.id}, toId: ${toSnap.id}`
    );
  }

  public async getMergeRecommendations(): Promise<Snapshot[]> {
    // merge recommendations are the last restored snapshot and a list of the last 10 snapshots
    const lastRestored = await Snapshot.getLastRestoredSnapshot();
    const latestNSnapshots = await Snapshot.getLatestNSnapshots(10);

    if (!lastRestored) {
      return latestNSnapshots;
    }

    // filter out lastRestored from list of last 10 snapshots
    const filteredSnapshots = latestNSnapshots.filter(
      (snap) => snap.id !== lastRestored.id
    );

    filteredSnapshots.unshift(lastRestored);
    return filteredSnapshots;
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
