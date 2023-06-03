/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, March 2023
 */

import { info } from 'electron-log';
import { powerMonitor } from 'electron';
import { WindowsActivityTracker } from '../../../release/app/PA.WindowsActivityTracker/typescript/src/index';
import ActiveWindow from '../../../release/app/PA.WindowsActivityTracker/typescript/src/types/ActiveWindow';
import ActiveWindowDb from '../entity/ActiveWindow';
import Settings from '../entity/Settings';

export default class WindowTracker {
  private _tracker: WindowsActivityTracker;
  private _currentWindow: ActiveWindow | null = null;
  private _idleCheckLoopRef: NodeJS.Timeout | undefined;

  public constructor() {
    this._tracker = new WindowsActivityTracker((activeWin) =>
      this.onWindowChange(activeWin)
    );
  }

  private async onWindowChange(newActiveWindow: ActiveWindow) {
    await this.storeCurrentWindow();
    this._currentWindow = newActiveWindow;
  }

  public async storeCurrentWindow() {
    const isDataAnonymized = await Settings.getIsDataAnonymized();
    if (this._currentWindow) {
      await ActiveWindowDb.insert({
        tsStart: this._currentWindow.ts.toISOString(),
        application: this._currentWindow.process,
        activity: this._currentWindow.activity,
        title: isDataAnonymized
          ? 'anonymized'
          : this._currentWindow.windowTitle,
        url: isDataAnonymized ? 'anonymized' : this._currentWindow.url,
        duration: Date.now() - this._currentWindow.ts.getTime(),
      });
      this._currentWindow = null;
    }
  }

  public start() {
    info('[WindowTracker] Starting window tracker');
    this.startIdleCheck();
    this._tracker.start();
  }

  public async stop() {
    info('[WindowTracker] Stopping window tracker');
    await this.storeCurrentWindow();
    await this.stopIdleCheck();
    this._tracker.stop();
  }

  public startIdleCheck() {
    this._idleCheckLoopRef = setInterval(async () => {
      if (powerMonitor.getSystemIdleTime() > 5 * 60) {
        this.storeCurrentWindow();
      }
    }, 10000);
  }

  public async stopIdleCheck() {
    clearInterval(this._idleCheckLoopRef);
  }
}
