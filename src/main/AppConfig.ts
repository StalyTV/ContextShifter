/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, Roy Rutishauser <royadrian.rutishauser@uzh.ch>, April 2023
 */

import { info, error } from 'electron-log';
import { app } from 'electron';
import path from 'path';
import { promises as fs, constants } from 'fs';
import YAML from 'yaml';

type Config = {
  excludedApplications: string[];
  snapshotShortcut: string;
  watchedDirectories: string[];
};

export default class AppConfig {
  private static config: Config = {
    excludedApplications: ['Finder'],
    snapshotShortcut: 'Ctrl+Shift+S',
    watchedDirectories: [],
  };

  private static dataFolder = path.join(app.getPath('appData'), app.getName());
  private static configFolder = path.join(this.dataFolder, 'config');
  private static configPath = path.join(this.configFolder, 'config.yaml');

  public static async loadConfig(): Promise<void> {
    try {
      // check if file exists
      await fs.access(this.configPath, constants.F_OK); // throws if file does not exist
    } catch (err) {
      // add config file
      info('[Config] No config file found. Create one.');
      await fs.mkdir(this.configFolder);
      const defaults = YAML.stringify(this.config);
      await fs.appendFile(this.configPath, defaults);
      return;
    }

    // read file content
    try {
      const content = await fs.readFile(this.configPath, { encoding: 'utf8' });
      this.config = YAML.parse(content) as Config;
    } catch (err) {
      error('[Config] Error loading config:', err);
    }
  }

  public static getExcludedApplications(): string[] {
    return this.config.excludedApplications;
  }

  public static getSnapshotShortcut(): string {
    return this.config.snapshotShortcut;
  }

  public static getWatchedDirectories(): string[] {
    return this.config.watchedDirectories;
  }
}
