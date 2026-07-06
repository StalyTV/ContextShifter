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
  name!: string;

  @Column({ type: 'varchar', nullable: false })
  path!: string;

  @Column({ type: 'tinyint', nullable: false })
  isActive!: boolean;

  @Column({ type: 'tinyint', nullable: false, default: true })
  isSelected!: boolean;

  @Column({ type: 'double', nullable: false, default: 0 })
  public relevance!: number;

  @Column({ type: 'double', nullable: true })
  public semanticRelevance!: number;

  @ManyToOne(() => IDE, (ide) => ide.ideFiles, {
    onDelete: 'CASCADE',
  })
  ide!: IDE;
}
