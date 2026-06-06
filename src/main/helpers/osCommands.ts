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
import ArtifactFiles from "../../types/ArtifactFiles";

const asyncExec = promisify(exec);

//TODO remove openArtifacts and merge method with openFiles
export async function openArtifact(artifact: Artifact) {
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


export async function openFiles(artifact: ArtifactFiles) {
  if (isMac) {
    let filesToOpen = artifact.artifact.map((file) => {
      return "'" + file + "'";
    }).join(' ');

    if(artifact.application){
      exec(`open -a '${artifact.application}' ${filesToOpen}`);
    }else{
      exec(`open -a ${filesToOpen}`);
    }

  }

  else {
    let filesToOpen = artifact.artifact.map((file) => {
      return  `"`+ file + `"`;
    }).join(',');

    const command = `ii ${filesToOpen}`;
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
    if (cleanedString === '') {
      return [];
    }

    let listOfPaths = cleanedString.split(',');
    listOfPaths = listOfPaths.map((path) => path.replace(/^\s*/g, '')); // remove spaces in front
    return listOfPaths.map((path) => path.replace(/\/$/g, '')); // remove last slash of paths
  } else {
    const command = `@((New-Object -com shell.application).Windows()).Document.Folder.Self.Path`;
    const res = await asyncExec(`chcp 65001>nul && powershell.exe "${command}"`, { shell: 'cmd.exe' });
    const filePaths = res.stdout.split('\r\n');
    filePaths.pop(); // remove last element as empty
    const cleanedList = filePaths.filter((path) => !path.startsWith('::')); // artifact that appears when viewing "QuickAccess"
    return cleanedList;
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
    const command = `ls ${recentFolderPath} | where{$_.LastWriteTime -ge [DateTime]'${since.toISOString()}'} | select -expand Name`;
    const res = await asyncExec(`chcp 65001>nul && powershell.exe "${command}"`, { shell: 'cmd.exe' });
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
    const res = await asyncExec(`chcp 65001>nul && powershell.exe "${command}"`, { shell: 'cmd.exe' });
    const cleanedRes = res.stdout.replace('\r\n', '');
    return cleanedRes;
  } catch (err) {
    error(err);
  }
}

export async function sampleOpenApplications(): Promise<string[]> {
  if (isMac) {
    const command = `osascript -e 'set apps to {}' -e 'tell application "System Events"' -e 'repeat with theProcess in processes' -e 'if not background only of theProcess then' -e 'tell theProcess' -e 'set processName to name' -e 'set appWindows to windows' -e 'end tell' -e 'if (count of appWindows) > 0 then' -e 'set end of apps to processName' -e 'end if' -e 'end if' -e 'end repeat' -e 'end tell' -e 'return apps'`;
    const res = await asyncExec(command);

    const stdout = res.stdout;
    const cleanedString = stdout.replace(/\n/g, '');
    if (cleanedString === '') {
      return [];
    }

    let listOfApps = cleanedString.split(',');
    listOfApps = listOfApps.map((app) => app.replace(/^\s*/g, '')); // remove spaces in front
    return listOfApps;
  } else {
    const command = `(Get-Process | where {$_.MainWindowTitle} | select -expand ProcessName) -join ','`;
    const res = await asyncExec(command, { shell: 'powershell.exe' });
    const cleanedString = res.stdout.replace(/\r\n/g, '');
    const listOfApps = cleanedString.split(',');

    const filteredList = listOfApps.filter(
      (appName) =>
        appName !== 'ApplicationFrameHost' && appName !== 'TextInputHost'
    );
    return filteredList;
  }
}
