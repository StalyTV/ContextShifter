/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, May 2023
 */

import { Entity, BaseEntity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity({ name: 'ide_file_event' })
export default class IDEFileEvent extends BaseEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column('varchar')
  ts!: string;

  @Column({ type: 'varchar', nullable: true })
  path!: string;

  @Column({ type: 'varchar', nullable: false })
  type!: 'active-file' | 'file-save';

  static async getRecentlyActiveIDEFiles(startTime: Date): Promise<string[]> {
    const entries = await this.createQueryBuilder('ide_file_event')
      .where('ide_file_event.ts >= :tsStart', {
        tsStart: startTime.toISOString(),
      })
      .groupBy('path')
      .getMany();
    const filePaths = entries.map((entry) => {
      return entry.path;
    });
    return filePaths;
  }
}
