/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, March 2023
 */

import Artifact from 'types/Artifact';
import { error } from 'electron-log';
import isMac from './isMac';
import { exec } from 'child_process';
import Application from 'main/entity/Application';
import { getFileNameFromPath } from './getFileNameFromPath';
import path from 'path';
import { app } from 'electron';
import { promisify } from 'util';

const asyncExec = promisify(exec);

export function openArtifact(artifact: Artifact) {
  if (isMac) {
    if (artifact.application) {
      exec(`open -a '${artifact.application}' '${artifact.artifact}'`);
    } else {
      exec(`open '${artifact.artifact}'`);
    }
  } else {
    exec(`"${artifact.artifact}"`);
  }
}

export function closeApplication(app: Application) {
  if (isMac) {
    exec(`osascript -e 'quit app "${app.path}"'`);
  } else {
    const exe = getFileNameFromPath(app.path);
    exec(`taskkill /IM ${exe}`);
  }
}

export async function getRecentlyOpenedFilePaths(
  since: Date
): Promise<string[]> {
  const recentlyAccessedFilePaths: string[] = [];
  if (isMac) {
    error('[osCommands] getRecentlyOpenedFilePaths() is not supported on Mac');
    return [];
  }

  try {
    const recentFolderPath: string = path.join(
      app.getPath('appData'),
      'Microsoft',
      'Windows',
      'Recent'
    );
    const command = `ls ${recentFolderPath} | where{$_.LastWriteTime -ge [DateTime]"${since.toISOString()}"} | select -expand Name`;
    const res = await asyncExec(command, { shell: 'powershell.exe' });
    const stdout = res.stdout;

    // extract links from stdout
    const lines = stdout.split(/\r?\n/);
    const links = lines.filter((line) => line.endsWith('.lnk'));

    for await (const link of links) {
      const linkPath = path.join(recentFolderPath, link);
      const resolvedLink = await resolveLink(linkPath);
      if (resolvedLink) {
        recentlyAccessedFilePaths.push(resolvedLink);
      }
    }
  } catch (err) {
    error(err);
  }

  return recentlyAccessedFilePaths;
}

async function resolveLink(linkPath: string) {
  try {
    const command = `(New-Object -ComObject WScript.Shell).CreateShortcut('${linkPath}').TargetPath`;
    const res = await asyncExec(command, { shell: 'powershell.exe' });
    return res.stdout;
  } catch (err) {
    error(err);
  }
}
