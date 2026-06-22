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

  // Guard against overlapping polls: active-win's helper binary *hangs*
  // indefinitely (it never resolves nor rejects) when the host process lacks
  // macOS Screen Recording permission. setInterval would otherwise spawn a new
  // hung `main` child every tick, piling up dozens of zombie processes while
  // tracking silently produces nothing. We allow only one poll in flight and
  // race it against a timeout so a hang surfaces as a catchable, logged error
  // and the loop keeps retrying (so it auto-recovers once permission returns).
  private _inFlight = false;
  private static readonly POLL_TIMEOUT_MS = 4_000;

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
      // Skip this tick if the previous poll hasn't settled yet (see _inFlight).
      if (this._inFlight) return;
      this._inFlight = true;
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
          if (/permission|timeout/i.test(String(detail))) {
            console.warn(
              `[WindowsActivityTracker] active-win unavailable: ${String(
                detail
              ).trim()} — window tracking paused. On macOS, grant this app ` +
                `Screen Recording AND Accessibility (System Settings > Privacy ` +
                `& Security) and restart. Suppressing repeats for 60s.`
            );
          } else {
            console.error(error);
          }
        }
      } finally {
        this._inFlight = false;
      }
    }, this.checkingForWindowChangeInterval);

    this.isRunning = true;
  }
  stop(): void {
    if (this.ref) clearInterval(this.ref);
    this.isRunning = false;
  }
}
