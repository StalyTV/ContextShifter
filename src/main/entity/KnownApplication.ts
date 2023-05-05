/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, May 2023
 */

import { Entity, BaseEntity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity({ name: 'known_application' })
export default class KnownApplication extends BaseEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', nullable: false })
  name!: string;

  @Column({ type: 'varchar', nullable: false })
  path!: string;

  @Column({ type: 'text', nullable: false })
  icon!: string;

  @Column({ type: 'tinyint', nullable: false, default: false })
  neverClose!: boolean;

  static async getAppsThatShouldNeverBeClosed(): Promise<KnownApplication[]> {
    const apps = await this.find({
      where: { neverClose: true },
    });
    return apps;
  }
}
