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
import IDE from '../entity/IDE';
import Browser from '../entity/Browser';

const asyncExec = promisify(exec);

export function openArtifact(artifact: Artifact) {
  if (isMac) {
    if (artifact.application) {
      exec(`open -a '${artifact.application}' '${artifact.artifact}'`);
    } else {
      exec(`open '${artifact.artifact}'`);
    }
  } else {
    const command = `ii "${artifact.artifact}"`;
    exec(command, { shell: 'powershell.exe' });
  }
}

export function closeApplication(app: Application | IDE | Browser) {
  if (isMac) {
    exec(`osascript -e 'quit app "${app.path}"'`);
  } else {
    const exe = getFileNameFromPath(app.path);
    const command = `taskkill /IM "${exe}"`;
    exec(command, { shell: 'powershell.exe' });
  }
}

export async function getOpenFileExplorerPaths(): Promise<string[]> {
  if (isMac) {
    const res = await asyncExec(
      `osascript -e 'tell application "Finder"' -e 'set targets to (target of every window)' -e 'end tell' -e 'set filePaths to {}' -e 'repeat with elem in targets' -e 'set filePath to POSIX path of (elem as alias)' -e 'set end of filePaths to filePath' -e 'end repeat' -e 'return filePaths'`
    );
    const stdout = res.stdout;
    const cleanedString = stdout.replace(/\n/g, '');
    let listOfPaths = cleanedString.split(',');
    listOfPaths = listOfPaths.map((path) => path.replace(/^\s*/g, '')); // remove spaces in front
    return listOfPaths.map((path) => path.replace(/\/$/g, '')); // remove last slash of paths
  } else {
    const command = `@((New-Object -com shell.application).Windows()).Document.Folder.Self.Path`;
    const res = await asyncExec(command, { shell: 'powershell.exe' });
    const filePaths = res.stdout.split('\r\n');
    filePaths.pop(); // remove last element as empty
    return filePaths;
  }
}

export async function closeFileExplorerPath(folderPath: string): Promise<void> {
  if (isMac) {
    const openPaths = await getOpenFileExplorerPaths();
    const windowIndex = openPaths.indexOf(folderPath);
    if (windowIndex > -1) {
      try {
        await asyncExec(
          `osascript -e 'tell application "Finder"' -e 'close window ${
            windowIndex + 1
          }' -e 'end tell'`
        );
      } catch (err) {
        error(err);
      }
    }
  } else {
    try {
      const command = `@((New-Object -com shell.application).Windows()) | Where-Object { $_.Document.Folder.Self.Path -like "${folderPath}" } | ForEach-Object { $_.Quit() }`;
      await asyncExec(command, { shell: 'powershell.exe' });
    } catch (err) {
      error(err);
    }
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
    const cleanedRes = res.stdout.replace('\r\n', '');
    return cleanedRes;
  } catch (err) {
    error(err);
  }
}

export function playWavSoundWindows(filePath: string) {
  try {
    const command = `(New-Object Media.SoundPlayer ${filePath}).PlaySync()`;
    exec(command, { shell: 'powershell.exe' });
  } catch (err) {
    error(err);
  }
}
