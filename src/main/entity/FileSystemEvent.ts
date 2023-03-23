/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, March 2023
 */

import { EventType } from '@parcel/watcher';
import { Entity, BaseEntity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity({ name: 'file_system_event' })
export default class FileSystemEvent extends BaseEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column('varchar')
  ts!: string;

  @Column({ type: 'varchar', nullable: false })
  path!: string;

  @Column({ type: 'varchar', nullable: false })
  type!: EventType;
}
