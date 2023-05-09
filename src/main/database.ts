/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, March 2023
 */

import { app } from 'electron';
import path from 'path';
import { DataSource } from 'typeorm';
import ActiveWindow from './entity/ActiveWindow';
import Application from './entity/Application';
import File from './entity/File';
import FileSystemEvent from './entity/FileSystemEvent';
import Log from './entity/Log';
import Snapshot from './entity/Snapshot';
import Browser from './entity/Browser';
import BrowserTab from './entity/BrowserTab';
import IDE from './entity/IDE';
import IDEFile from './entity/IDEFile';
import UsageData from './entity/UsageData';
import KnownApplication from './entity/KnownApplication';
import ActiveBrowserTab from './entity/ActiveBrowserTab';
import ActiveIDEFile from './entity/ActiveIDEFile';

const dbPath = path.join(
  app.getPath('appData'),
  app.getName(),
  'database.sqlite'
);

export const Database = new DataSource({
  database: dbPath,
  type: 'better-sqlite3',
  entities: [
    ActiveWindow,
    Log,
    FileSystemEvent,
    Snapshot,
    Application,
    File,
    Browser,
    BrowserTab,
    IDE,
    IDEFile,
    UsageData,
    KnownApplication,
    ActiveBrowserTab,
    ActiveIDEFile,
  ],
  synchronize: true,
});
