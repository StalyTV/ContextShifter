/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, March 2023
 */

import { info } from 'electron-log';
import { WindowsActivityTracker } from '../../../release/app/PA.WindowsActivityTracker/typescript/src/index';
import ActiveWindow from '../../../release/app/PA.WindowsActivityTracker/typescript/src/types/ActiveWindow';
import ActiveArtifact from './ActiveArtifact';

export default class WindowTracker {
  private _tracker: WindowsActivityTracker;

  public constructor() {
    this._tracker = new WindowsActivityTracker((activeWin) =>
      this.onWindowChange(activeWin)
    );
  }

  private async onWindowChange(newActiveWindow: ActiveWindow) {
    ActiveArtifact.setCurrentWindow(newActiveWindow);
  }

  public start() {
    info('[WindowTracker] Starting window tracker');
    this._tracker.start();
  }

  public async stop() {
    info('[WindowTracker] Stopping window tracker');
    this._tracker.stop();
  }
}
