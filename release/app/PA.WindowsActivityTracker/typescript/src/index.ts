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

    this.ref = setInterval(async () => {
      try {
        const res = await activeWin();
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
        // Throttle: active-win throws on every tick when the OS permission is
        // missing, which would otherwise flood the console once per second.
        const now = Date.now();
        if (
          now - this._lastErrorLogAt >
          WindowsActivityTracker.ERROR_LOG_THROTTLE_MS
        ) {
          this._lastErrorLogAt = now;
          const detail =
            (error as { stdout?: string })?.stdout ||
            (error as Error)?.message ||
            String(error);
          if (/permission/i.test(String(detail))) {
            console.warn(
              `[WindowsActivityTracker] active-win unavailable: ${String(
                detail
              ).trim()} (window tracking paused; suppressing repeats for 60s)`
            );
          } else {
            console.error(error);
          }
        }
      }
    }, this.checkingForWindowChangeInterval);

    this.isRunning = true;
  }
  stop(): void {
    if (this.ref) clearInterval(this.ref);
    this.isRunning = false;
  }
}
