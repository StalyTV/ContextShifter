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
import IDEFile from './IDEFile';

@Entity({ name: 'ide' })
export default class IDE extends BaseEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', nullable: false })
  name!: string;

  @Column({ type: 'varchar', nullable: false })
  path!: string;

  @Column({ type: 'text', nullable: false })
  icon!: string;

  @Column({ type: 'text', nullable: false })
  title!: string;

  @Column({ type: 'varchar', nullable: true })
  branch!: string;

  @Column({ type: 'varchar', nullable: true })
  lastCommitMessage!: string;

  @Column({ type: 'varchar', nullable: true })
  workspaceName!: string;

  @Column({ type: 'varchar', nullable: true })
  workspacePath!: string;

  @Column({ type: 'tinyint', nullable: false, default: true })
  isSelected!: boolean;

  @ManyToOne(() => Snapshot, (snapshot) => snapshot.applications, {
    onDelete: 'CASCADE',
  })
  snapshot!: Snapshot;

  @OneToMany(() => IDEFile, (file) => file.ide)
  ideFiles!: IDEFile[];
}
