/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, May 2023
 */

import { Entity, BaseEntity, PrimaryColumn, Column } from 'typeorm';

@Entity({ name: 'settings' })
export default class Settings extends BaseEntity {
  @PrimaryColumn({ type: 'varchar' })
  key!: string;

  @Column({ type: 'varchar', nullable: true })
  value!: string | null;

  static async getIsDataAnonymized(): Promise<boolean> {
    const isAnonymized = (await this.findOneBy({ key: 'isDataAnonymized' }))
      ?.value;
    if (isAnonymized) {
      return isAnonymized === 'true';
    }
    return false;
  }

  static async getSnapshotShortcut(): Promise<string> {
    const shortcut = (await this.findOneBy({ key: 'snapshotShortcut' }))?.value;
    if (shortcut) {
      return shortcut;
    }
    return 'Ctrl+Shift+Q';
  }

  static async getEndOfDayPopUpTime(): Promise<Date> {
    const setTime = (await this.findOneBy({ key: 'endOfDayPopUpTime' }))?.value;
    if (setTime) {
      return new Date(setTime);
    } else {
      return new Date(new Date().setHours(16, 30, 0, 0));
    }
  }

  static async getIsArtefactSelectionEnabled(): Promise<boolean> {
    // Default ON: only OFF when explicitly set to 'false'.
    const enabled = (
      await this.findOneBy({ key: 'isArtefactSelectionEnabled' })
    )?.value;
    return enabled !== 'false';
  }

  static async getKeepArtefactsOnSwitch(): Promise<boolean> {
    // Default OFF: switching tasks closes the other artefacts as usual. When ON,
    // activating a task only OPENS its artefacts and nothing is closed.
    const keep = (await this.findOneBy({ key: 'keepArtefactsOnSwitch' }))
      ?.value;
    return keep === 'true';
  }

  static async getShowRelevanceScores(): Promise<boolean> {
    // Default OFF: the relevance/semantic scores are only shown in the
    // selection screen when explicitly enabled.
    const enabled = (await this.findOneBy({ key: 'showRelevanceScores' }))
      ?.value;
    return enabled === 'true';
  }

  static async getIsStudyDataCollectionEnabled(): Promise<boolean> {
    // Default OFF: data collection records artefact names, paths and URLs, so
    // it is opt-in. Only ON when the user explicitly enables it in Settings.
    const enabled = (
      await this.findOneBy({ key: 'isStudyDataCollectionEnabled' })
    )?.value;
    return enabled === 'true';
  }

  static async getColorTheme(): Promise<'dark' | 'light'> {
    // Default DARK on a fresh install; only light when explicitly chosen.
    const theme = (await this.findOneBy({ key: 'colorTheme' }))?.value;
    return theme === 'light' ? 'light' : 'dark';
  }

  static async getShowQuestionnaireOnlyOnWorkdays(): Promise<boolean> {
    const onlyShowWorkdays = (
      await this.findOneBy({ key: 'showQuestionnaireOnlyOnWorkdays' })
    )?.value;
    if (onlyShowWorkdays && onlyShowWorkdays === 'false') {
      return false;
    }
    return true;
  }
}
