/*
 * ArtifactUsage
 * -------------
 * Per-task, per-artefact accumulated usage stats, persisted so scoring
 * continues across multiple sessions of the same task. One row per
 * (snapshotId, key). Updated whenever a task stops being active; reloaded when
 * the task is made active again. Stats for a task are only ever touched while
 * THAT task is the active one, so other tasks can't affect them.
 *
 * `key` is a stable artefact identifier:
 *   app:<path> | ide:<path> | tab:<url> | file:<path>
 */

import {
  Entity,
  BaseEntity,
  PrimaryGeneratedColumn,
  Column,
  Index,
} from 'typeorm';

export type ArtifactKind = 'app' | 'ide' | 'tab' | 'file';

@Entity({ name: 'artifact_usage' })
@Index(['snapshotId', 'key'], { unique: true })
export default class ArtifactUsage extends BaseEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column('integer')
  snapshotId!: number;

  @Column('varchar')
  key!: string;

  @Column('varchar')
  kind!: ArtifactKind;

  // --- metadata, enough to rebuild the artefact for the picker ---
  @Column({ type: 'varchar', nullable: true })
  name!: string;

  @Column({ type: 'varchar', nullable: true })
  path!: string;

  @Column({ type: 'varchar', nullable: true })
  url!: string;

  @Column({ type: 'varchar', nullable: true })
  title!: string;

  @Column({ type: 'text', nullable: true })
  icon!: string;

  @Column({ type: 'text', nullable: true })
  favIconUrl!: string;

  @Column({ type: 'varchar', nullable: true })
  browserType!: string;

  // --- accumulated stats across all sessions of the task ---
  @Column({ type: 'integer', default: 0 })
  totalDurationMs!: number;

  @Column({ type: 'integer', default: 0 })
  accessCount!: number;

  // Total interactions (clicks + keystrokes) while this artefact was focused,
  // accumulated across all sessions of the task.
  @Column({ type: 'integer', default: 0 })
  interactionCount!: number;

  @Column({ type: 'varchar', nullable: true })
  lastAccessTs!: string;

  // Last-access position on the task's cumulative active-time clock (ms). Used
  // for the recency decay so idle time / between-session gaps don't age it.
  @Column({ type: 'integer', default: 0 })
  lastAccessActiveMs!: number;

  // --- semantic relevance (content embedding + similarity to task theme) ---
  // Cached embedding (JSON array of floats) and the text it was computed from,
  // so it's only recomputed when the artefact's text changes.
  @Column({ type: 'text', nullable: true })
  embedding!: string;

  @Column({ type: 'text', nullable: true })
  embeddedText!: string;

  // Normalized semantic relevance [0,1] and the raw cosine it came from (logged
  // so the cosine->[0,1] mapping can be calibrated from real data).
  @Column({ type: 'double', default: 1 })
  semanticSimilarity!: number;

  @Column({ type: 'double', nullable: true })
  semanticCosine!: number;

  // last computed score (cached for analysis / display)
  @Column({ type: 'double', default: 0 })
  score!: number;

  static async getForSnapshot(snapshotId: number): Promise<ArtifactUsage[]> {
    return this.find({ where: { snapshotId } });
  }
}
