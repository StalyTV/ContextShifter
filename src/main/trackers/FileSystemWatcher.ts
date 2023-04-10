/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, March 2023
 */

import { info, debug, error } from 'electron-log';
import watcher from '@parcel/watcher';
import FileSystemEvent from '../entity/FileSystemEvent';

export default class FileSystemWatcher {
  private _subscriptions: watcher.AsyncSubscription[];
  private _watchedDirectories: string[];

  public constructor() {
    this._watchedDirectories = [
      '/Users/remyegloff/Documents',
      '/Users/remyegloff/master_thesis',
    ];
    this._subscriptions = [];
  }

  private async onFsEvent(err: Error | null, events: watcher.Event[]) {
    if (err) {
      error(`[FileSystemWatcher] error watching events`, err);
      return;
    }
    for (const e of events) {
      if (e.path.includes('.git')) continue;

      await FileSystemEvent.insert({
        ts: new Date().toISOString(),
        path: e.path,
        type: e.type,
      });
    }
  }

  public async start() {
    info(
      '[FileSystemWatcher] Starting watching file changes. The following directories are watched: ',
      this._watchedDirectories
    );

    for (const dir of this._watchedDirectories) {
      try {
        const ref = await watcher.subscribe(dir, this.onFsEvent);
        this._subscriptions.push(ref);
      } catch (err) {
        error('[FileSystemWatcher]', err, dir);
      }
    }
  }

  public stop() {
    info('[WindowTracker] Stopping watching file changes');
    this._subscriptions.forEach((s) => s.unsubscribe());
    this._subscriptions = [];
  }
}
