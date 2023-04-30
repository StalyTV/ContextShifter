/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, April 2023
 */

import { Entity, BaseEntity, PrimaryGeneratedColumn, Column } from 'typeorm';
import { error } from 'electron-log';
import { UsageDataEvent } from '../../types/UsageDataEvent';

@Entity({ name: 'usage_data' })
export default class UsageData extends BaseEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', nullable: false })
  origin!: 'system' | 'user';

  @Column({ type: 'varchar', nullable: false })
  ts!: string;

  @Column({ type: 'varchar', nullable: false })
  type!: UsageDataEvent;

  @Column({ type: 'text', nullable: true })
  additionalInformation!: string;

  static async addEntry(
    event: UsageDataEvent,
    isSystemEvent: boolean = false,
    additionalInformation?: string
  ): Promise<void> {
    try {
      await this.insert({
        origin: isSystemEvent ? 'system' : 'user',
        ts: new Date().toISOString(),
        type: event,
        additionalInformation: additionalInformation,
      });
    } catch (err) {
      error('[UsageData] Error inserting entry', err);
    }
  }
}
