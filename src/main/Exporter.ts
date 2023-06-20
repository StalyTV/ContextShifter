/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, May 2023
 */

import path from 'path';
import Snapshot from './entity/Snapshot';
import fs from 'fs';
import { app } from 'electron';
import { info, debug } from 'electron-log';
import { promisify } from 'util';
import { error } from 'console';
import { Database } from './database';
import Log from './entity/Log';

const writeFile = promisify(fs.writeFile);

export default class Exporter {
  private static _backupLoopRef: NodeJS.Timeout | undefined;

  public static _exportFolder = path.join(
    app.getPath('appData'),
    app.getName(),
    'backup'
  );

  public static async startBackupLoop(): Promise<void> {
    info('[Exporter] Started backup loop');

    const loop = async () => {
      debug('[Exporter] Checked to crate backup');
      const lastExport = await Log.getLastExport();
      if (!lastExport || lastExport.getDate() !== new Date().getDate()) {
        await Exporter.createTextExport();
      }
    };

    await loop();
    this._backupLoopRef = setInterval(loop, 60 * 60 * 1000);
  }

  public static async stopBackupLoop() {
    clearInterval(this._backupLoopRef);
  }

  public static async createTextExport(): Promise<void> {
    let exportContent: string = '';
    const consideredSnapshots: Snapshot[] = await Snapshot.getLatestNSnapshots(
      10
    );
    consideredSnapshots.forEach((snapshot) => {
      const text = Exporter.getTextExportForSnapshot(snapshot);
      exportContent += text;
      exportContent += '\n---\n';
    });

    const now = new Date();
    const formattedDate = `${now.getFullYear()}-${
      now.getMonth() + 1
    }-${now.getDate()}`;
    const exportPath = path.join(Exporter._exportFolder, `${formattedDate}.md`);
    try {
      await writeFile(exportPath, exportContent);
      info(`[Exporter] Saved backup to ${exportPath}`);
      Database.manager.save(Log, {
        key: 'lastExport',
        value: now.toISOString(),
      });
    } catch (err) {
      error(err);
    }
  }

  private static getTextExportForSnapshot(snapshot: Snapshot): string {
    let description = '';
    description += `# ${snapshot.name}\n`;
    description += `created: ${snapshot.created}\n`;
    description += `edited: ${snapshot.edited}\n`;
    description += '\n';
    description += '## Summary\n';
    description += snapshot.summary
      ? `\`\`\`\n${snapshot.summary}\n\`\`\`\n`
      : '_no summary provided_\n';
    description += '\n';
    description += '## Intent\n';
    description += snapshot.intent
      ? `\`\`\`\n${snapshot.intent}\n\`\`\`\n`
      : '_no intent provided_\n';
    description += '\n';

    description += '## Browsers\n';
    const selectedBrowsers = snapshot.browsers.filter((browser) => {
      return browser.isSelected;
    });
    if (selectedBrowsers.length === 0) {
      description += '_no browsers selected_\n';
    } else {
      selectedBrowsers.forEach((browser) => {
        description += `### ${browser.name}\n`;
        const selectedTabs = browser.browserTabs.filter((tab) => {
          return tab.isSelected;
        });
        if (selectedTabs.length === 0) {
          description += `_no tabs selected_\n`;
        } else {
          selectedTabs.forEach((tab) => {
            description += `\`${tab.url}\`\n`;
          });
        }
      });
    }
    description += '\n';
    description += '## IDEs\n';
    const selectedIDEs = snapshot.ides.filter((ide) => {
      return ide.isSelected;
    });
    if (selectedIDEs.length === 0) {
      description += '_no ide selected_\n';
    } else {
      selectedIDEs.forEach((ide) => {
        description += `### ${ide.name}\n`;
        const selectedFiles = ide.ideFiles.filter((file) => {
          return file.isSelected;
        });
        selectedFiles.forEach((file) => {
          description += `\`${file.path}\`\n`;
        });
      });
    }

    description += '\n';
    description += '## Applications\n';
    const selectedApps = snapshot.applications.filter((app) => {
      return app.isSelected;
    });
    if (selectedApps.length === 0) {
      description += '_no applications selected_\n';
    } else {
      selectedApps.forEach((app) => {
        description += `### ${app.name}\n`;
        const selectedFiles = app.files.filter((file) => {
          return file.isSelected;
        });
        if (selectedFiles.length === 0) {
          description += `_no file selected_\n`;
        } else {
          selectedFiles.forEach((file) => {
            description += `\`${file.path}\`\n`;
          });
        }
      });
    }

    return description;
  }
}
