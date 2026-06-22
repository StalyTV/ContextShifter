import activeWin from "active-win";
import ITracker from "./types/ITracker";
import ActiveWindow from "./types/ActiveWindow";
import determineActivity from "./determineActivity";

/**
 * This is a cross-platform tracker class that allows you to subscribe to active window changes. It does so by wrapping the 'active-win' library found at: https://www.npmjs.com/package/active-win
 * It should be noted that per default in case a window was active for less than 1 second, there is a possbility that the callback will not fire. If you need to have more precise window change events, consider lowering "checkingForWindowChangeInterval"
 */
export class WindowsActivityTracker implements ITracker {
  name = "WindowsActivityTracker";
  isRunning = false;
  private ref: NodeJS.Timeout | undefined;

  onWindowChange: (activeWind: ActiveWindow) => void;
  checkingForWindowChangeInterval: number;

  private _prev: ActiveWindow | undefined;

  // active-win fails on every poll when Screen Recording / Accessibility isn't
  // granted; throttle that error so it doesn't flood the console.
  private _lastErrorLogAt = 0;
  private static readonly ERROR_LOG_THROTTLE_MS = 60_000;

  // active-win's helper binary *hangs* indefinitely (never resolves nor
  // rejects) when the host process lacks macOS Screen Recording permission, and
  // the abandoned `main` child keeps running. To avoid silent death and a flood
  // of zombie children we (a) self-schedule each poll only AFTER the previous
  // one settles (no overlap), (b) race every poll against a timeout so a hang
  // becomes a catchable/logged error, and (c) back the poll interval off after
  // consecutive timeouts so a persistent hang leaks at most ~1 child/minute
  // instead of one every few seconds. A single success snaps back to fast
  // polling, so the loop auto-recovers the moment permission is granted.
  private static readonly POLL_TIMEOUT_MS = 4_000;
  private static readonly MAX_BACKOFF_MS = 60_000;
  private _consecutiveTimeouts = 0;

  /**
   * Constructor for creating a WindowsActivityTracker instance
   * @param onWindowChange This is a callaback function that receives the activeWindow as an argument and is fired whenever the active window changes.
   * @param checkingForWindowChangeInterval The interval that is used to check for active window changes (in milliseconds)
   */
  constructor(
    onWindowChange: (activeWind: ActiveWindow) => void,
    checkingForWindowChangeInterval: number = 1000
  ) {
    this.onWindowChange = onWindowChange;
    this.checkingForWindowChangeInterval = checkingForWindowChangeInterval;
  }

  start(): void {
    if (this.isRunning) {
      console.log(`${this.name} is already running!`);
      return;
    }
    this.isRunning = true;
    this.scheduleNext(0);
  }

  private scheduleNext(delayMs: number): void {
    if (!this.isRunning) return;
    this.ref = setTimeout(() => this.poll(), delayMs);
  }

  private async poll(): Promise<void> {
      try {
        const res = await Promise.race([
          activeWin(),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error("active-win timeout")),
              WindowsActivityTracker.POLL_TIMEOUT_MS
            )
          ),
        ]);
        this._consecutiveTimeouts = 0;
        const window = {
          ts: new Date(),
          windowTitle: res?.title || undefined,
          process: res?.owner.name || undefined,
          processPath: res?.owner.path,
          processId: res?.owner.processId,
          url: res?.platform === "macos" ? res.url : undefined,
        };

        // If there is no previous window in memory -> handle as a "change window" and trigger callback
        // Or, if there is a window that is different from the previous window
        if (
          !this._prev ||
          (this._prev.windowTitle !== window.windowTitle ||
            this._prev.process !== window.process)
        ) {
          // for performance reasons we only determine the activity once we actually have to
          const activity = determineActivity(res?.title, res?.owner.name);
          const activeWindow: ActiveWindow = { ...window, activity };
          this.onWindowChange(activeWindow);
          this._prev = activeWindow;
        }
      } catch (error) {
        const detail =
          (error as { stdout?: string })?.stdout ||
          (error as Error)?.message ||
          String(error);
        const isStall = /permission|timeout/i.test(String(detail));
        if (isStall) this._consecutiveTimeouts += 1;
        // Throttle: active-win fails on every poll when the OS permission is
        // missing, which would otherwise flood the console.
        const now = Date.now();
        if (
          now - this._lastErrorLogAt >
          WindowsActivityTracker.ERROR_LOG_THROTTLE_MS
        ) {
          this._lastErrorLogAt = now;
          if (isStall) {
            console.warn(
              `[WindowsActivityTracker] active-win unavailable: ${String(
                detail
              ).trim()} — window tracking paused (backing off). On macOS, grant ` +
                `this app Screen Recording AND Accessibility (System Settings > ` +
                `Privacy & Security) and restart. Suppressing repeats for 60s.`
            );
          } else {
            console.error(error);
          }
        }
      } finally {
        // Reschedule only after the poll settles, so calls never overlap. Back
        // off geometrically while active-win keeps stalling (capped), then
        // resume fast polling as soon as a call succeeds.
        const base = this.checkingForWindowChangeInterval;
        const delay =
          this._consecutiveTimeouts > 0
            ? Math.min(
                base * 2 ** Math.min(this._consecutiveTimeouts, 6),
                WindowsActivityTracker.MAX_BACKOFF_MS
              )
            : base;
        this.scheduleNext(delay);
      }
  }
  stop(): void {
    if (this.ref) clearTimeout(this.ref);
    this.isRunning = false;
  }
}
