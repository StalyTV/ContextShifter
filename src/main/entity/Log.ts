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

  static async getLastApplicationStart(): Promise<Date> {
    const lastStart = (await this.findOneBy({ key: 'lastStart' }))?.value;
    if (lastStart) {
      return new Date(lastStart);
    } else {
      throw new Error('Last application start not found in database');
    }
  }
}
