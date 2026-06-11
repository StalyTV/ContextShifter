/*
 * NeverCloseBrowserTab
 * --------------------
 * A browser tab the user marked as "never close". When a task is restored,
 * TaskRestorer keeps these tabs open even if they don't belong to the task —
 * the tab equivalent of KnownApplication.neverClose.
 *
 * Keyed by url (one protected entry per url). browserType is stored so the UI
 * can group / show which browser the tab belongs to.
 */

import {
  Entity,
  BaseEntity,
  PrimaryGeneratedColumn,
  Column,
} from 'typeorm';
import { BrowserType } from '../../types/BrowserType';

@Entity({ name: 'never_close_browser_tab' })
export default class NeverCloseBrowserTab extends BaseEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', nullable: false })
  url!: string;

  @Column({ type: 'varchar', nullable: true })
  title!: string;

  @Column({ type: 'text', nullable: true })
  favIconUrl!: string;

  @Column({ type: 'varchar', nullable: true })
  browserType!: BrowserType;

  static async getAll(): Promise<NeverCloseBrowserTab[]> {
    return this.find();
  }

  static async getUrlSet(): Promise<Set<string>> {
    const tabs = await this.find();
    return new Set(tabs.map((t) => t.url));
  }
}
