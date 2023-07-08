/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, March 2023
 */

import { Entity, BaseEntity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity({ name: 'active_window' })
export default class ActiveWindow extends BaseEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column('varchar')
  tsStart!: string;

  @Column({ type: 'varchar', nullable: true })
  application!: string;

  @Column({ type: 'varchar', nullable: true })
  applicationPath!: string;

  @Column({ type: 'varchar', nullable: true })
  processId!: number;

  @Column({ type: 'varchar', nullable: true })
  title!: string;

  @Column({ type: 'varchar', nullable: true })
  activity!: string;

  @Column({ type: 'varchar', nullable: true })
  url!: string;

  @Column({ type: 'int', nullable: false })
  public duration!: number;

  // only consider each application once
  static async getRecentlyActiveWindows(
    startTime: Date
  ): Promise<ActiveWindow[]> {
    const recentActiveWindows = await this.createQueryBuilder('active_window')
      .addSelect('MAX(active_window.tsStart)', 'maxTs')
      .where('active_window.tsStart >= :tsStart', {
        tsStart: startTime.toISOString(),
      })
      .andWhere('active_window.applicationPath IS NOT NULL')
      .andWhere(`active_window.application != 'UserNotificationCenter'`)
      .andWhere(`active_window.application != 'loginwindow'`)
      .andWhere(`active_window.application != 'Windows Shell Experience Host'`)
      .andWhere(`active_window.application != 'SearchHost.exe'`)
      .andWhere(
        `active_window.application != 'Windows host process (Rundll32)'`
      )
      .andWhere(`active_window.application != 'Pick an app'`)
      .andWhere(`active_window.title != '[no window selected]'`) // likely, this makes the checks above obsolete
      .groupBy('active_window.application')
      .getMany();
    return recentActiveWindows;
  }

  static async getLastAppAccess(appName: string): Promise<Date | null> {
    const lastAccess = await this.findOne({
      where: { application: appName },
      order: { tsStart: 'DESC' },
    });
    if (lastAccess) {
      return new Date(lastAccess.tsStart);
    } else {
      return null;
    }
  }

  static async getAccessCount(
    appName: string,
    startTime: Date
  ): Promise<number> {
    const count = await this.createQueryBuilder('active_window')
      .where('active_window.tsStart >= :tsStart', {
        tsStart: startTime.toISOString(),
      })
      .andWhere('active_window.application == :appName', {
        appName: appName,
      })
      .getCount();

    return count;
  }

  static async getAccessDuration(
    appName: string,
    startTime: Date
  ): Promise<number> {
    const sum = await this.createQueryBuilder('active_window')
      .where('active_window.tsStart >= :tsStart', {
        tsStart: startTime.toISOString(),
      })
      .andWhere('active_window.application == :appName', {
        appName: appName,
      })
      .select('SUM(active_window.duration)', 'totalDuration')
      .getRawOne();
    return sum.totalDuration || 0;
  }

  static async getMostActiveApp(startTimeWindow: Date): Promise<string | null> {
    const mostActiveApp = await this.createQueryBuilder('active_window')
      .where('active_window.tsStart >= :tsStart', {
        tsStart: startTimeWindow.toISOString(),
      })
      .groupBy('active_window.application')
      .select('application, SUM(active_window.duration)', 'totalDuration')
      .orderBy('totalDuration', 'DESC')
      .getRawOne();
    return mostActiveApp.application || null;
  }
}
