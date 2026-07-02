/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, April 2023
 */

import {
  Entity,
  BaseEntity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import Snapshot from './Snapshot';
import BrowserTab from './BrowserTab';
import { BrowserType } from '../../types/BrowserType';

@Entity({ name: 'browser' })
export default class Browser extends BaseEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'double', nullable: true })
  windowId!: number | undefined;

  @Column({ type: 'varchar', nullable: false })
  name!: string | undefined;

  @Column({ type: 'varchar', nullable: false })
  type!: BrowserType;

  @Column({ type: 'varchar', nullable: false })
  path!: string;

  @Column({ type: 'text', nullable: false })
  icon!: string;

  @Column({ type: 'text', nullable: false })
  title!: string | undefined;

  @Column({ type: 'tinyint', nullable: false, default: true })
  isSelected!: boolean;

  @Column({ type: 'double', nullable: false, default: 0 })
  public relevance!: number;

  // Profile this window belongs to (transient — set on the live snapshot so the
  // restorer can target/close the right profile). Not part of the committed set.
  @Column({ type: 'varchar', nullable: true })
  profileId!: string;

  @Column({ type: 'varchar', nullable: true })
  profileEmail!: string;

  @ManyToOne(() => Snapshot, (snapshot) => snapshot.applications, {
    onDelete: 'CASCADE',
  })
  snapshot!: Snapshot;

  @OneToMany(() => BrowserTab, (tab) => tab.browser, { cascade: true, onDelete: 'CASCADE' })
  browserTabs!: BrowserTab[];
}
