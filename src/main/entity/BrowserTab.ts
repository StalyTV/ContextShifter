/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, April 2023
 */

import { BaseEntity, Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import Browser from './Browser';

@Entity({ name: 'browser_tab' })
export default class BrowserTab extends BaseEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', nullable: true })
  title!: string;

  @Column({ type: 'varchar', nullable: false })
  url!: string;

  @Column({ type: 'varchar', nullable: true })
  favIconUrl!: string;

  @Column({ type: 'int', nullable: true })
  index!: number;

  @Column({ type: 'tinyint', nullable: false })
  isActive!: boolean;

  @Column({ type: 'tinyint', nullable: false, default: true })
  isSelected!: boolean;

  @Column({ type: 'double', nullable: false, default: 0 })
  public relevance!: number;

  // Semantic relevance [0,1] (transient — surfaced in the picker for testing).
  @Column({ type: 'double', nullable: true })
  public semanticRelevance!: number;

  // Which browser *profile* this tab was tracked in, so it can be reopened in
  // that profile (not merged into one window). `profileId` is the extension's
  // stable per-profile id; `profileEmail` (Chrome, signed-in) lets the app map
  // to Chrome's --profile-directory for launching a closed profile.
  @Column({ type: 'varchar', nullable: true })
  profileId!: string;

  @Column({ type: 'varchar', nullable: true })
  profileEmail!: string;

  @ManyToOne(() => Browser, (browser) => browser.browserTabs, {
    onDelete: 'CASCADE'
  })
  browser!: Browser;
}
