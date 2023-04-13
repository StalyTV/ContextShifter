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
import Browser from './Browser';
import IDE from './IDE';

@Entity({ name: 'snapshot' })
export default class Snapshot extends BaseEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column('varchar')
  name!: string;

  @Column({ type: 'text', nullable: true })
  summary!: string;

  @Column({ type: 'text', nullable: true })
  intent!: string;

  @Column({ type: 'varchar', nullable: false })
  created!: string;

  @Column({ type: 'varchar', nullable: true })
  edited!: string;

  @Column({ type: 'tinyint', nullable: false, default: false })
  isArchived!: boolean;

  @OneToMany(() => Application, (app) => app.snapshot)
  applications!: Application[];

  @OneToMany(() => Browser, (browser) => browser.snapshot)
  browsers!: Browser[];

  @OneToMany(() => IDE, (ide) => ide.snapshot)
  ides!: IDE[];

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
      return await this.getSnapshotById(latestSnapshot.id);
    }
  }

  static async getSnapshotById(id: number): Promise<Snapshot | null> {
    const snapshot = await this.findOneBy({ id: id });
    if (!snapshot) {
      return null;
    } else {
      const snapshot = await this.createQueryBuilder('snapshot')
        .leftJoinAndSelect('snapshot.browsers', 'browsers')
        .leftJoinAndSelect('browsers.browserTabs', 'browserTabs')
        .leftJoinAndSelect('snapshot.ides', 'ides')
        .leftJoinAndSelect('ides.ideFiles', 'ideFiles')
        .leftJoinAndSelect('snapshot.applications', 'applications')
        .leftJoinAndSelect('applications.files', 'files')
        .where('snapshot.id = :id', { id: id })
        .getOne();
      return snapshot;
    }
  }

  static async getLatestNSnapshots(n: number): Promise<Snapshot[]> {
    const lastNSnapshots = await this.find({
      where: {},
      order: { id: 'DESC' },
      take: n,
    });
    const snapshotIds = lastNSnapshots.map((snapshot) => snapshot.id);
    if (lastNSnapshots.length === 0) {
      return [];
    } else {
      const snapshots = await this.createQueryBuilder('snapshot')
        .leftJoinAndSelect('snapshot.browsers', 'browsers')
        .leftJoinAndSelect('browsers.browserTabs', 'browserTabs')
        .leftJoinAndSelect('snapshot.ides', 'ides')
        .leftJoinAndSelect('ides.ideFiles', 'ideFiles')
        .leftJoinAndSelect('snapshot.applications', 'applications')
        .leftJoinAndSelect('applications.files', 'files')
        .where('snapshot.id IN (:...ids)', {
          ids: snapshotIds,
        })
        .getMany();
      return snapshots;
    }
  }
}
