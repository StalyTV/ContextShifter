/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, June 2023
 */

import { PrimaryGeneratedColumn, Entity, BaseEntity, Column } from 'typeorm';
import { StudyPhase } from '../../types/StudyPhase';

@Entity({ name: 'questionnaire_answers' })
export default class QuestionnaireAnswers extends BaseEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', nullable: false })
  ts!: string;

  @Column({ type: 'varchar' })
  type!: 'end-of-day' | 'task-resumption';

  @Column({ type: 'varchar' })
  studyPhase!: StudyPhase;

  @Column({ type: 'text', nullable: true })
  answers!: string;

  @Column({ type: 'text', nullable: true })
  additionalInformation!: string;
}
