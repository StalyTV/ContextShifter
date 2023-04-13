/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, April 2023
 */

import {
  Column,
  PrimaryGeneratedColumn,
  Entity,
  BaseEntity,
  ManyToOne,
} from 'typeorm';
import IDE from './IDE';

@Entity({ name: 'ide_file' })
export default class IDEFile extends BaseEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', nullable: false })
  path!: string;

  @Column({ type: 'tinyint', nullable: false })
  isActive!: boolean;

  @Column({ type: 'tinyint', nullable: false, default: true })
  isSelected!: boolean;

  @ManyToOne(() => IDE, (ide) => ide.ideFiles)
  ide!: IDE;
}

