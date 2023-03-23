/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, March 2023
 */

import { app } from 'electron';
import path from 'path';
import { DataSource } from 'typeorm';
import ActiveWindow from './entity/ActiveWindow';
import FileSystemEvent from './entity/FileSystemEvent';
import Log from './entity/Log';

const dbPath = path.join(
  app.getPath('appData'),
  app.getName(),
  'database.sqlite'
);

export const Database = new DataSource({
  database: dbPath,
  type: 'better-sqlite3',
  entities: [ActiveWindow, Log, FileSystemEvent],
  synchronize: true,
});
