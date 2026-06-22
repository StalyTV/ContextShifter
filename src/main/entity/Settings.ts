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

  static async getIsStudyDataCollectionEnabled(): Promise<boolean> {
    const enabled = (
      await this.findOneBy({ key: 'isStudyDataCollectionEnabled' })
    )?.value;
    return enabled === 'true';
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
