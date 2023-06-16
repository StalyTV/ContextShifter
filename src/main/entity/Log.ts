/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, March 2023
 */

import { Entity, BaseEntity, PrimaryColumn, Column } from 'typeorm';

@Entity({ name: 'log' })
export default class Log extends BaseEntity {
  @PrimaryColumn({ type: 'varchar' })
  key!: string;

  @Column({ type: 'varchar', nullable: true })
  value!: string | null;

  static async wasApplicationStartedOnce(): Promise<boolean> {
    const lastStart = (await this.findOneBy({ key: 'lastStart' }))?.value;
    if (lastStart) {
      return true;
    } else {
      return false;
    }
  }

  static async getLastExport(): Promise<Date | null> {
    const lastExport = (await this.findOneBy({ key: 'lastExport' }))?.value;
    if (lastExport) {
      return new Date(lastExport);
    } else {
      return null;
    }
  }

  static async getLastEndOfDayPopUp(): Promise<Date | null> {
    const lastPopUp = (await this.findOneBy({ key: 'lastEndOfDayPopUp' }))
      ?.value;
    if (lastPopUp) {
      return new Date(lastPopUp);
    } else {
      return null;
    }
  }
}
