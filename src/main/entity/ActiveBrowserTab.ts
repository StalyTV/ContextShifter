/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, May 2023
 */

import { Entity, BaseEntity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity({ name: 'active_browser_tab' })
export default class ActiveBrowserTab extends BaseEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', nullable: true })
  tsStart!: string;

  @Column({ type: 'varchar', nullable: true })
  url!: string;

  @Column({ type: 'int', nullable: true })
  public duration!: number;

  static async getRecentlyActiveURLs(startTime: Date): Promise<string[]> {
    const entries = await this.createQueryBuilder('active_browser_tab')
      .where('active_browser_tab.ts >= :tsStart', {
        tsStart: startTime.toISOString(),
      })
      .groupBy('url')
      .getMany();
    const urls = entries.map((entry) => {
      return entry.url;
    });
    return urls;
  }
}
