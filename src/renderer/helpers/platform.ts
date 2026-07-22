/*
 * Renderer-side platform detection. The renderer has no direct access to
 * `process.platform`, so we derive the OS from the Chromium user-agent string
 * (Electron always includes "Windows NT" / "Macintosh" there). Used to show
 * OS-appropriate setup instructions.
 */

const ua =
  typeof navigator !== 'undefined' ? navigator.userAgent : '';

export const isWindows = /Windows/i.test(ua);
export const isMac = /Macintosh|Mac OS X/i.test(ua);
