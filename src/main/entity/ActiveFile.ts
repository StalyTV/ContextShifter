/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, June 2023
 */

import { Entity, BaseEntity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity({ name: 'active_file' })
export default class ActiveFile extends BaseEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', nullable: false })
  tsStart!: string;

  @Column({ type: 'varchar', nullable: false })
  path!: string;

  @Column({ type: 'int', nullable: true })
  public duration!: number;

  static async getLastFileAccess(filePath: string): Promise<Date | null> {
    const lastAccess = await this.findOne({
      where: { path: filePath },
      order: { tsStart: 'DESC' },
    });
    if (lastAccess) {
      return new Date(lastAccess.tsStart);
    } else {
      return null;
    }
  }

  static async getAccessCount(
    filePath: string,
    startTime: Date
  ): Promise<number> {
    const count = await this.createQueryBuilder('active_file')
      .where('active_file.tsStart >= :tsStart', {
        tsStart: startTime.toISOString(),
      })
      .andWhere('active_file.path == :path', {
        path: filePath,
      })
      .getCount();

    return count;
  }

  static async getAccessDuration(
    filePath: string,
    startTime: Date
  ): Promise<number> {
    const sum = await this.createQueryBuilder('active_file')
      .where('active_file.tsStart >= :tsStart', {
        tsStart: startTime.toISOString(),
      })
      .andWhere('active_file.path == :path', {
        path: filePath,
      })
      .select('SUM(active_file.duration)', 'totalDuration')
      .getRawOne();
    return sum.totalDuration || 0;
  }
}
