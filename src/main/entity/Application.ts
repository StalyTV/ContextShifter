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
  ManyToOne,
  OneToMany,
} from 'typeorm';
import File from './File';
import Snapshot from './Snapshot';

@Entity({ name: 'application' })
export default class Application extends BaseEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', nullable: false })
  name!: string;

  @Column({ type: 'varchar', nullable: false })
  path!: string;

  @Column({ type: 'text', nullable: false })
  icon!: string;

  @Column({ type: 'tinyint', nullable: false, default: true })
  isSelected!: boolean;

  @ManyToOne(() => Snapshot, (snapshot) => snapshot.applications, {
    onDelete: 'CASCADE',
  })
  snapshot!: Snapshot;

  @OneToMany(() => File, (file) => file.application)
  files!: File[];
}
