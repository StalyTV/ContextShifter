/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, June 2023
 */

import { Entity, BaseEntity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity({ name: 'analysis_open_ide_files' })
export default class AnalysisOpenIDEFiles extends BaseEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', nullable: false })
  ts!: string;

  @Column({ type: 'text', nullable: true })
  additionalInformation!: string;

  @Column({ type: 'tinyint', nullable: false, default: false })
  isIdle!: boolean;
}
