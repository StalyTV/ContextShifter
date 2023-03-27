/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, March 2023
 */

import {
  Entity,
  BaseEntity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
} from 'typeorm';
import Application from './Application';

@Entity({ name: 'snapshot' })
export default class Snapshot extends BaseEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column('varchar')
  name!: string;

  @Column({ type: 'varchar', nullable: false })
  created!: string;

  @Column({ type: 'varchar', nullable: true })
  edited!: string;

  @Column({ type: 'varchar', nullable: false, default: false })
  isArchived!: boolean;

  @OneToMany(() => Application, (app) => app.snapshot)
  applications!: Application[];

  static async getNextId(): Promise<number> {
    const lastSnapshot = await this.findOne({
      where: {},
      order: { id: 'DESC' },
    });
    if (lastSnapshot) {
      return lastSnapshot.id + 1;
    } else {
      return 1;
    }
  }

  static async getLatestSnapshot(): Promise<Snapshot | null> {
    const latestSnapshot = await this.findOne({
      where: {},
      order: { id: 'DESC' },
    });
    if (!latestSnapshot) {
      return null;
    } else {
      const snapshot = await this.createQueryBuilder('snapshot')
        .leftJoinAndSelect('snapshot.applications', 'applications')
        .leftJoinAndSelect('applications.files', 'files')
        .where('snapshot.id = :id', { id: latestSnapshot.id })
        .getOne();
      return snapshot;
    }
  }
}
