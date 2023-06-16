/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, June 2023
 */

import { StudyPhase } from '../types/StudyPhase';
import WindowManager from './WindowManager';
import { Database } from './database';
import Log from './entity/Log';
import Settings from './entity/Settings';
import UsageData from './entity/UsageData';
import { info, debug } from 'electron-log';

export default class StudyManager {
  private static _currentStudyPhase: StudyPhase = StudyPhase.NoStudy; // default
  private static _postponeTimeoutRef: NodeJS.Timeout | undefined;
  private static _checkTimeLoopRef: NodeJS.Timeout | undefined;

  public static getStudyPhase(): StudyPhase {
    return this._currentStudyPhase;
  }

  public static async postponeEndOfDayQuestionnaire(
    minutes: number
  ): Promise<void> {
    this._postponeTimeoutRef = setTimeout(async () => {
      await WindowManager.createEndOfDayWindow(() => {});
      this.resetTimeout();
    }, minutes * 60 * 1000);
    WindowManager.endOfDayWindow?.close();

    await UsageData.addEntry(
      'postpone-end-of-day-questionnaire',
      false,
      `minutes: ${minutes}`
    );
    info('[StudyManager] Postponed End-Of-Day Questionnaire');
  }

  private static resetTimeout(): void {
    if (this._postponeTimeoutRef) {
      clearTimeout(this._postponeTimeoutRef);
      this._postponeTimeoutRef = undefined;
    }
  }

  public static async startCheckTimeLoop(): Promise<void> {
    info('[StudyManager] Started check time loop');

    const loop = async () => {
      debug('[StudyManager] Checked time');
      const setTime = await Settings.getEndOfDayPopUpTime();
      const now = new Date();
      if (
        now.getHours() > setTime.getHours() ||
        (now.getHours() === setTime.getHours() &&
          now.getMinutes() >= setTime.getMinutes())
      ) {
        const lastPopUp = await Log.getLastEndOfDayPopUp();
        if (!lastPopUp || lastPopUp.getDate() !== now.getDate()) {
          await WindowManager.createEndOfDayWindow(() => {});
          info('[StudyManager] Opened End-Of-Day Pop-Up');
          Database.manager.save(Log, {
            key: 'lastEndOfDayPopUp',
            value: now.toISOString(),
          });
        }
      }
    };

    await loop();
    this._checkTimeLoopRef = setInterval(loop, 5 * 60 * 1000);
  }

  public static async stopCheckTimeLoop() {
    clearInterval(this._checkTimeLoopRef);
  }
}
