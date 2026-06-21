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
  IsNull,
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

  @Column({ type: 'varchar', nullable: true })
  lastRestore!: string;

  @Column({ type: 'varchar', nullable: false })
  lastChange!: string; // needed for sorting

  @Column({ type: 'tinyint', nullable: false, default: false })
  isArchived!: boolean;

  @Column({ type: 'tinyint', nullable: false, default: false })
  isReady!: boolean;

  // Phase 2: one-level subtask support. null = top-level task.
  @Column({ type: 'integer', nullable: true })
  parentId!: number | null;

  // Accumulated active (foreground) time across all sessions of this task, in
  // milliseconds. Denominator for normalized-duration in artefact scoring.
  @Column({ type: 'integer', nullable: false, default: 0 })
  activeMs!: number;

  @OneToMany(() => Application, (app) => app.snapshot)
  applications!: Application[];

  @OneToMany(() => Browser, (browser) => browser.snapshot, {
    cascade: ['insert', 'update'],
  })
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
      where: { isArchived: false },
      order: { id: 'DESC' },
    });
    if (!latestSnapshot) {
      return null;
    } else {
      return await this.getSnapshotById(latestSnapshot.id);
    }
  }

  static async getSecondLastSnapshot(): Promise<Snapshot | null> {
    const latestSnapshot = await this.createQueryBuilder('snapshot')
      .where('snapshot.isArchived = false')
      .orderBy('snapshot.id', 'DESC')
      .skip(1)
      .getOne();
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
        .orderBy('applications.isSelected', 'DESC')
        .getOne();
      return snapshot;
    }
  }

  static async getLatestNSnapshots(n: number): Promise<Snapshot[]> {
    const lastNSnapshots = await this.find({
      where: { isArchived: false, parentId: IsNull() },
      order: { lastChange: 'DESC' },
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
        .orderBy('snapshot.lastChange', 'DESC')
        .getMany();
      return snapshots;
    }
  }

  static async getLastTwoSnapshotsOfToday(): Promise<Snapshot[]> {
    const lastTwoSnapshotsOfToday = await this.find({
      where: { isArchived: false },
      order: { created: 'DESC' },
      take: 2,
    });
    const snapshotIds = lastTwoSnapshotsOfToday.map((snapshot) => snapshot.id);
    const res: Snapshot[] = [];
    for await (const id of snapshotIds) {
      const snapshot = await this.getSnapshotById(id);
      if (snapshot) {
        const creationDate = new Date(snapshot.created);
        if (creationDate.getDate() === new Date().getDate()) {
          res.push(snapshot);
        }
      }
    }

    return res;
  }

  static async getTotalNumSnapshots(): Promise<number> {
    return this.count();
  }

  static async getLastRestoredSnapshot(): Promise<Snapshot | null> {
    const lastRestoredSnap = await this.createQueryBuilder('snapshot')
      .where('snapshot.lastRestore is not null')
      .orderBy('snapshot.lastRestore', 'DESC')
      .getOne();
    return lastRestoredSnap;
  }

  static async getChildrenOf(parentId: number): Promise<Snapshot[]> {
    return this.find({
      where: { isArchived: false, parentId },
      order: { lastChange: 'DESC' },
    });
  }
}
