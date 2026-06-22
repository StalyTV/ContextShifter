/*
 * StudyDataRecord
 * ---------------
 * One row captured every time a task ends and its artefact selection is saved
 * (commit-task-artefacts), while study data collection is enabled. It records,
 * for the ended task, the full set of scored artefacts AND which of them the
 * user manually kept in the selection — so the study can compare the scorer's
 * ranking against the participant's actual choices.
 *
 * `payload` holds the full structured record as JSON (see StudyDataCollector);
 * the flat columns exist for quick inspection / ordering.
 */

import {
  Entity,
  BaseEntity,
  PrimaryGeneratedColumn,
  Column,
} from 'typeorm';

@Entity({ name: 'study_data_record' })
export default class StudyDataRecord extends BaseEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column('integer')
  snapshotId!: number;

  @Column({ type: 'varchar', nullable: true })
  taskName!: string;

  @Column({ type: 'varchar' })
  recordedAt!: string;

  @Column('text')
  payload!: string;

  static async getAllOrdered(): Promise<StudyDataRecord[]> {
    return this.find({ order: { id: 'ASC' } });
  }
}
