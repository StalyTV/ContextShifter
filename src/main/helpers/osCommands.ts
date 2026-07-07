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

/**
 * The file path of the document open in the frontmost app's front window, via
 * the Accessibility AXDocument attribute (macOS). Works for document-based apps
 * (Preview, Word, Pages, TextEdit, …) that expose their open file; returns null
 * otherwise. Needs the Accessibility permission (already required by active-win).
 */
export async function getFrontDocumentPath(): Promise<string | null> {
  if (!isMac) return null;
  const script = `tell application "System Events"
  set procs to (every process whose frontmost is true)
  if (count of procs) is 0 then return ""
  try
    set d to value of attribute "AXDocument" of window 1 of (item 1 of procs)
    if d is missing value then return ""
    return d as text
  on error
    return ""
  end try
end tell`;
  try {
    const { stdout } = await asyncExec(`osascript -e '${script}'`, {
      timeout: 2000,
    });
    const raw = (stdout || '').trim();
    if (!raw) return null;
    if (raw.startsWith('file://')) {
      return decodeURIComponent(raw.replace(/^file:\/\//, ''));
    }
    return raw.startsWith('/') ? raw : null;
  } catch {
    return null;
  }
}

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

/**
 * List the currently running foreground (GUI) applications with their bundle
 * paths. Used to decide which apps to close on a task switch.
 *
 * On macOS this uses System Events, which only needs the Automation
 * permission — NOT Screen Recording / Accessibility (which `active-win`
 * requires and which is flaky for unsigned dev builds). That makes the
 * close-the-rest behaviour work reliably.
 */
export async function getRunningApplications(): Promise<
  { name: string; path: string }[]
> {
  try {
    if (isMac) {
      // `timeout` kills the child if it blocks — e.g. the first call triggers
      // the macOS "control System Events" Automation prompt, and osascript
      // hangs until it's answered. Without this, a task switch would freeze.
      const res = await asyncExec(
        `osascript ` +
          `-e 'set out to ""' ` +
          `-e 'tell application "System Events"' ` +
          `-e 'repeat with p in (every process whose background only is false)' ` +
          `-e 'try' ` +
          `-e 'set out to out & (name of p) & tab & (POSIX path of (application file of p)) & linefeed' ` +
          `-e 'end try' ` +
          `-e 'end repeat' ` +
          `-e 'end tell' ` +
          `-e 'return out'`,
        { timeout: 6000 }
      );
      return res.stdout
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const tab = line.indexOf('\t');
          if (tab === -1) return { name: line, path: '' };
          return {
            name: line.slice(0, tab).trim(),
            path: line.slice(tab + 1).trim(),
          };
        })
        .filter((a) => a.path);
    }
    // Windows: processes that own a visible main window.
    const command =
      `Get-Process | Where-Object { $_.MainWindowTitle -ne '' -and $_.Path } | ` +
      `ForEach-Object { "$($_.Name)` +
      "`t" +
      `$($_.Path)" }`;
    const res = await asyncExec(`powershell.exe -NoProfile -Command "${command}"`, {
      shell: 'powershell.exe',
      timeout: 6000,
    });
    return res.stdout
      .split('\r\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const tab = line.indexOf('\t');
        if (tab === -1) return { name: line, path: '' };
        return { name: line.slice(0, tab).trim(), path: line.slice(tab + 1).trim() };
      })
      .filter((a) => a.path);
  } catch (err) {
    error(`[osCommands] getRunningApplications failed: ${String(err)}`);
    return [];
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
