/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, June 2023
 */

import { debug } from 'electron-log';
import ActiveWindow from '../../../release/app/PA.WindowsActivityTracker/typescript/src/types/ActiveWindow';
import Settings from '../entity/Settings';
import ActiveWindowDb from '../entity/ActiveWindow';
import { powerMonitor } from 'electron';
import { ActiveTab } from 'types/ActiveTab';
import { hashUrl } from '../helpers/hashUrl';
import ActiveBrowserTab from '../entity/ActiveBrowserTab';

// the purpose of this class is to provide references to the currently open artifact and to store it to db
export default class ActiveArtifact {
  private static _currentWindow: ActiveWindow | null = null;
  private static _currentTab: ActiveTab | null = null;
  private static _lastTab: ActiveTab | null = null;
  private static _idleCheckLoopRef: NodeJS.Timeout | undefined;

  public static async setCurrentWindow(activeWindow: ActiveWindow) {
    await this.storeCurrentWindow();
    this._currentWindow = activeWindow;

    // when the window changes and before a browser tab was in focus, store it
    if (this._currentTab) {
      this.storeCurrentTab();
    }
  }

  public static async storeCurrentWindow() {
    const isDataAnonymized = await Settings.getIsDataAnonymized();
    if (this._currentWindow) {
      await ActiveWindowDb.insert({
        tsStart: this._currentWindow.ts.toISOString(),
        application: this._currentWindow.process,
        applicationPath: this._currentWindow.processPath,
        processId: this._currentWindow.processId,
        activity: this._currentWindow.activity,
        title: isDataAnonymized
          ? 'anonymized'
          : this._currentWindow.windowTitle,
        url: isDataAnonymized ? 'anonymized' : this._currentWindow.url,
        duration: Date.now() - this._currentWindow.ts.getTime(),
      });
      this._currentWindow = null;
      debug('[ActiveArtifact] Stored active window');
    }
  }

  public static async setCurrentTab(activeTab: ActiveTab) {
    if (!this._currentTab) {
      this._currentTab = activeTab;
    } else if (this._currentTab.url !== activeTab.url) {
      await this.storeCurrentTab();
      this._currentTab = activeTab;
    }
  }

  public static getLastActiveTab(): ActiveTab | null {
    return this._lastTab;
  }

  public static async storeCurrentTab() {
    if (this._currentTab) {
      const urlToStore = hashUrl(this._currentTab.url);
      const dbEntry = new ActiveBrowserTab();
      dbEntry.url = urlToStore;
      dbEntry.tsStart = this._currentTab.ts.toISOString();
      dbEntry.duration = Date.now() - this._currentTab.ts.getTime();
      dbEntry.save();

      this._lastTab = this._currentTab;
      this._currentTab = null;
      debug('[ActiveArtifact] Stored active tab');
    }
  }

  public static async storeAll() {
    debug('[ActiveArtifact] Stored all open artifacts');
    await this.storeCurrentWindow();
    await this.storeCurrentTab();
  }

  public static startIdleCheck() {
    this._idleCheckLoopRef = setInterval(async () => {
      if (powerMonitor.getSystemIdleTime() > 5 * 60) {
        this.storeAll();
      }
    }, 10000);
  }

  public static async stopIdleCheck() {
    clearInterval(this._idleCheckLoopRef);
  }
}
