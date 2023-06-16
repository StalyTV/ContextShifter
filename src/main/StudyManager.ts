/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, June 2023
 */

import { StudyPhase } from '../types/StudyPhase';
import WindowManager from './WindowManager';
import UsageData from './entity/UsageData';
import { info } from 'electron-log';

export default class StudyManager {
  private static _currentStudyPhase: StudyPhase = StudyPhase.NoStudy; // default
  private static _postponeTimeoutRef: NodeJS.Timeout | undefined;

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
}
