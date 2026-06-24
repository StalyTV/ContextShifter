/*
 * InteractionTracker
 * ------------------
 * Counts user interactions — clicks and keystrokes — globally and attributes
 * each one to the artefact ContextShifter currently considers focused (via
 * ActiveTaskSession). Only the COUNT is captured, never the key or content.
 *
 * Backed by uiohook-napi (a global libuiohook hook). On macOS this needs the
 * "Input Monitoring" / "Accessibility" permission; without it the app keeps
 * working, interactions simply aren't counted. Everything is wrapped so a load
 * or permission failure can never crash the app.
 */

import { info, warn } from 'electron-log';
import ActiveTaskSession from '../ActiveTaskSession';

export default class InteractionTracker {
  private _started = false;
  private _hook: any | undefined;

  public start(): void {
    if (this._started) return;
    try {
      // Lazy require: native module, keep it out of the import graph until used.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { uIOhook } = require('uiohook-napi');
      this._hook = uIOhook;

      const onInteraction = () => {
        try {
          ActiveTaskSession.getInstance().onInteraction();
        } catch {
          // best-effort
        }
      };

      // One count per key press and per mouse-button press (ignore key/mouse
      // up, wheel, and movement so we don't double-count or count noise).
      uIOhook.on('keydown', onInteraction);
      uIOhook.on('mousedown', onInteraction);

      uIOhook.start();
      this._started = true;
      info('[InteractionTracker] Started global interaction hook');
    } catch (err) {
      warn(
        `[InteractionTracker] Could not start interaction hook (interactions will not be counted): ${String(
          err
        )}`
      );
      this._hook = undefined;
    }
  }

  public stop(): void {
    if (!this._started || !this._hook) return;
    try {
      this._hook.removeAllListeners();
      this._hook.stop();
    } catch (err) {
      warn(`[InteractionTracker] Error stopping interaction hook: ${String(err)}`);
    }
    this._started = false;
    this._hook = undefined;
    info('[InteractionTracker] Stopped global interaction hook');
  }
}
