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
import isMac from './helpers/isMac';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';

export default class StudyManager {
  private static _currentStudyPhase: StudyPhase = StudyPhase.NoStudy; // default
  private static _postponeTimeoutRef: NodeJS.Timeout | undefined;
  private static _checkTimeLoopRef: NodeJS.Timeout | undefined;

  public static async init() {
    const tempPath = isMac
      ? `Library/Logs/${app.name}/study_config.txt`
      : `AppData/Roaming/${app.name}/logs/study_config.txt`;
    const configPath = path.join(app.getPath('home'), tempPath);

    try {
      // create file for new users
      const wasStartedOnce = await Log.wasApplicationStartedOnce();
      if (!wasStartedOnce) {
        fs.writeFileSync(configPath, 'baseline');
      }

      // only set study settings if config file exists
      if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, {
          encoding: 'utf8',
          flag: 'r',
        });

        if (content.toLowerCase() === 'baseline') {
          this._currentStudyPhase = StudyPhase.Baseline;
        } else if (content.toLowerCase() === 'intervention') {
          this._currentStudyPhase = StudyPhase.Intervention;
        } else {
          this._currentStudyPhase = StudyPhase.Intervention; // default in case of misspelling
        }
        UsageData.addEntry(
          'active-study-phase',
          true,
          `${this._currentStudyPhase}`
        );
      }
    } catch (err) {
      console.error(err);
    }

    // hide dock icon during first study phase
    if (isMac && this._currentStudyPhase === StudyPhase.Baseline) {
      app.dock.hide;
    }
    info(`[StudyManager] Current study phase: ${this._currentStudyPhase}`);
  }

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
    if (this._currentStudyPhase === StudyPhase.NoStudy) {
      info(`[StudyManager] Not in study mode. Don't start time check loop`);
      return;
    }
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
