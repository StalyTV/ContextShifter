/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, May 2023
 */

import path from 'path';
import Snapshot from './entity/Snapshot';
import fs from 'fs';
import { app } from 'electron';
import { info } from 'electron-log';
import { promisify } from 'util';
import { error } from 'console';
import { Database } from './database';
import Log from './entity/Log';

const writeFile = promisify(fs.writeFile);

export default class Exporter {
  public static _exportFolder = path.join(
    app.getPath('appData'),
    app.getName(),
    'backup'
  );

  public static async createTextExport(): Promise<void> {
    let exportContent: string = '';
    const consideredSnapshots: Snapshot[] = await Snapshot.getLatestNSnapshots(
      10
    );
    consideredSnapshots.forEach((snapshot) => {
      const text = Exporter.getTextExportForSnapshot(snapshot);
      exportContent += text;
      exportContent += '\n\n ######################################### \n\n';
    });

    const timestamp = new Date().toISOString();
    const exportPath = path.join(Exporter._exportFolder, `${timestamp}.txt`);
    try {
      await writeFile(exportPath, exportContent);
      info(`[Exporter] Saved backup to ${exportPath}`);
      Database.manager.save(Log, {
        key: 'lastExport',
        value: timestamp,
      });
    } catch (err) {
      error(err);
    }
  }

  private static getTextExportForSnapshot(snapshot: Snapshot): string {
    let description = '';
    description += `name: ${snapshot.name}\n`;
    description += `created: ${snapshot.created}\n`;
    description += `edited: ${snapshot.edited}\n`;
    description += '\n';
    if (snapshot.summary) {
      description += `summary:\n ${snapshot.summary}\n\n`;
    }
    if (snapshot.intent) {
      description += `intent:\n ${snapshot.intent}\n`;
    }
    description += '\n';

    // browser tabs
    snapshot.browsers.forEach((browser) => {
      if (browser.isSelected) {
        description += `"${browser.name}"\n`;
        browser.browserTabs.forEach((tab) => {
          if (tab.isSelected) {
            description += `\t${tab.url}\n`;
          }
        });
        description += '\n';
      }
    });

    // IDE files
    snapshot.ides.forEach((ide) => {
      if (ide.isSelected) {
        description += `"${ide.name}"\n`;
        ide.ideFiles.forEach((file) => {
          if (file.isSelected) {
            description += `\t${file.path}\n`;
          }
        });
        description += '\n';
      }
    });

    // other applications
    description += 'selected applications:\n';
    snapshot.applications.forEach((app) => {
      if (app.isSelected) {
        description += `"${app.name}"\n`;
        app.files.forEach((file) => {
          if (file.isSelected) {
            description += `\t${file.path}\n`;
          }
        });
        description += '\n';
      }
    });

    return description;
  }
}
