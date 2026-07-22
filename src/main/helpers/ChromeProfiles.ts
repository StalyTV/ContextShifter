/*
 * ChromeProfiles
 * --------------
 * Bridges the browser extension's per-profile identity to Chrome's on-disk
 * profile directories, so ContextShifter can reopen a task's tabs in the right
 * profile — and launch that profile directly (no profile picker) when Chrome is
 * closed or the profile isn't open yet.
 *
 * The extension can report a profile's *email* (chrome.identity) but not its
 * `--profile-directory` folder name (there is no such API). Chrome's own
 * `Local State` file maps directories ("Default", "Profile 1", …) to the
 * signed-in account, so we read it to resolve email -> directory.
 *
 * Chrome only. Profile directories/binary are resolved per-platform (macOS and
 * Windows). Other browsers fall back to the existing extension-only open path.
 */

import { homedir } from 'os';
import { join } from 'path';
import { readFileSync, existsSync } from 'fs';
import { spawn } from 'child_process';
import { debug, info } from 'electron-log';
import isMac from './isMac';

export type ChromeProfileDir = {
  directory: string; // e.g. "Default", "Profile 1"
  email: string; // signed-in account ("" if none)
  name: string; // display name
};

// Chrome's user-data directory ("User Data" on Windows, "…/Google/Chrome" on
// macOS); its `Local State` file maps profile directories to signed-in accounts.
const CHROME_USER_DATA = isMac
  ? join(homedir(), 'Library', 'Application Support', 'Google', 'Chrome')
  : join(
      process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'),
      'Google',
      'Chrome',
      'User Data'
    );

const LOCAL_STATE = join(CHROME_USER_DATA, 'Local State');

// First existing chrome executable for the platform.
function resolveChromeBinary(): string {
  const candidates = isMac
    ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
    : [
        join(
          process.env.PROGRAMFILES ?? 'C:\\Program Files',
          'Google',
          'Chrome',
          'Application',
          'chrome.exe'
        ),
        join(
          process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)',
          'Google',
          'Chrome',
          'Application',
          'chrome.exe'
        ),
        join(
          process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'),
          'Google',
          'Chrome',
          'Application',
          'chrome.exe'
        ),
      ];
  return candidates.find((p) => existsSync(p)) ?? candidates[0];
}

const CHROME_BINARY = resolveChromeBinary();

/** Parse Chrome's `Local State` into the list of known profile directories. */
export function readChromeProfiles(): ChromeProfileDir[] {
  try {
    const raw = readFileSync(LOCAL_STATE, 'utf8');
    const json = JSON.parse(raw) as {
      profile?: { info_cache?: Record<string, { user_name?: string; name?: string }> };
    };
    const cache = json.profile?.info_cache ?? {};
    return Object.entries(cache).map(([directory, meta]) => ({
      directory,
      email: (meta.user_name ?? '').trim(),
      name: (meta.name ?? directory).trim(),
    }));
  } catch (err) {
    debug(`[ChromeProfiles] could not read Local State: ${String(err)}`);
    return [];
  }
}

/**
 * Resolve a profile's `--profile-directory` from the email the extension
 * reported. Returns null when Chrome isn't installed the standard way, the
 * profile is signed-out (no email), or no match is found.
 */
export function resolveProfileDirectory(email: string | undefined): string | null {
  if (!email) return null;
  const target = email.trim().toLowerCase();
  const match = readChromeProfiles().find(
    (p) => p.email.toLowerCase() === target
  );
  return match ? match.directory : null;
}

/**
 * Launch Chrome without selecting a profile. Used when a task's Chrome tabs
 * can't be tied to a known `--profile-directory` (signed-out profile, or no
 * `Local State` match): we still need Chrome running so the user can pick a
 * profile — Chrome will most likely show its profile picker — after which the
 * profile's extension connects and the tabs are opened through it. No URLs are
 * passed on the command line on purpose, so the tabs aren't opened twice (once
 * by Chrome, once by the extension). Returns true if the launch was issued.
 */
export function launchChrome(): boolean {
  try {
    const child = spawn(CHROME_BINARY, [], { detached: true, stdio: 'ignore' });
    child.unref();
    info('[ChromeProfiles] launched Chrome (no profile — expecting picker)');
    return true;
  } catch (err) {
    // Fallback when the binary path differs: `open -a` on macOS, `start` on
    // Windows (via cmd, which resolves Chrome off the App Paths registry).
    try {
      const child = isMac
        ? spawn('open', ['-a', 'Google Chrome'], {
            detached: true,
            stdio: 'ignore',
          })
        : spawn('cmd', ['/c', 'start', '', 'chrome'], {
            detached: true,
            stdio: 'ignore',
          });
      child.unref();
      return true;
    } catch (err2) {
      info(`[ChromeProfiles] failed to launch Chrome: ${String(err2)}`);
      return false;
    }
  }
}

/**
 * Open `urls` in a specific Chrome profile. Invoking the Chrome binary with
 * `--profile-directory` opens a window for that profile whether or not Chrome is
 * already running (Chrome routes it to the existing process), and passing the
 * profile directory up front means Chrome never shows the profile picker.
 */
export function launchChromeProfile(directory: string, urls: string[]): boolean {
  if (urls.length === 0) return false;
  try {
    const child = spawn(
      CHROME_BINARY,
      [`--profile-directory=${directory}`, ...urls],
      { detached: true, stdio: 'ignore' }
    );
    child.unref();
    info(
      `[ChromeProfiles] launched profile "${directory}" with ${urls.length} tab(s)`
    );
    return true;
  } catch (err) {
    // Fallback when the binary path differs. macOS: `open -na`. Windows: `start`
    // via cmd, which resolves chrome.exe from the App Paths registry key.
    try {
      const child = isMac
        ? spawn(
            'open',
            [
              '-na',
              'Google Chrome',
              '--args',
              `--profile-directory=${directory}`,
              ...urls,
            ],
            { detached: true, stdio: 'ignore' }
          )
        : spawn(
            'cmd',
            [
              '/c',
              'start',
              '',
              'chrome',
              `--profile-directory=${directory}`,
              ...urls,
            ],
            { detached: true, stdio: 'ignore' }
          );
      child.unref();
      return true;
    } catch (err2) {
      info(`[ChromeProfiles] failed to launch profile "${directory}": ${String(err2)}`);
      return false;
    }
  }
}
