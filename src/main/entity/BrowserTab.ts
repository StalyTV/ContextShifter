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
import Browser from './Browser';

@Entity({ name: 'browser_tab' })
export default class BrowserTab extends BaseEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', nullable: true })
  title!: string | undefined;

  @Column({ type: 'varchar', nullable: false })
  url!: string;

  @Column({ type: 'varchar', nullable: true })
  favIconUrl!: string | undefined;

  @Column({ type: 'int', nullable: true })
  index!: number;

  @Column({ type: 'tinyint', nullable: false })
  isActive!: boolean;

  @Column({ type: 'tinyint', nullable: false, default: true })
  isSelected!: boolean;

  @Column({ type: 'double', nullable: false, default: 0 })
  public relevance!: number;

  @ManyToOne(() => Browser, (browser) => browser.browserTabs, {
    onDelete: 'CASCADE',
  })
  browser!: Browser;
}
