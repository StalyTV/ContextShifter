/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, March 2023
 */

import { info, debug } from 'electron-log';
import * as fs from 'fs';

export default class FileSystemWatcher {
  private _watchers: fs.FSWatcher[];
  private _watchedDirectories: string[];

  public constructor() {
    this._watchedDirectories = ['/Users/remyegloff/Documents'];
    this._watchers = [];
  }

  private async onFsChange(eventType: fs.WatchEventType, file: string) {
    console.log(eventType, file);
  }

  public start() {
    info(
      '[FileSystemWatcher] Starting watching file changes. The following directories are watched: ',
      this._watchedDirectories
    );

    this._watchedDirectories.forEach((dir) => {
      const watcher = fs.watch(dir, (eventname, filename) => {
        this.onFsChange(eventname, filename);
      });
      this._watchers.push(watcher);
    });
  }

  public stop() {
    info('[WindowTracker] Stopping watching file changes');
    this._watchers.forEach((watcher) => watcher.close());
    this._watchers = [];
  }
}
