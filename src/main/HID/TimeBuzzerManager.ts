import { info, error } from 'electron-log';
import TaskManager from '../TaskManager';

const TimeBuzzer = require('./time-buzzer');
// libusb-based hotplug events (no polling). The package is shipped via
// release/app/node_modules/usb and exposes attach/detach events on its
// default export.
const { usb } = require('usb');

/**
 * TimeBuzzerManager - bridges the physical TimeBuzzer to TaskManager.
 *
 * Event mapping:
 *  - touch (tap) ........ (unused - kept for future use)
 *  - position (rotation)  open/cycle the task switcher
 *  - press .............. single: select / drilldown when switcher is open
 *                         double: back / close
 */
export default class TimeBuzzerManager {
  private static _instance: TimeBuzzerManager;

  // ---- Tunables ----
  private static readonly DOUBLE_PRESS_WINDOW_MS = 400;
  // Small delay after USB attach before scanning MIDI ports - the OS needs
  // a moment to register the device with CoreMIDI / ALSA / WinMM.
  private static readonly HOTPLUG_SETTLE_MS = 750;

  private _device: any | undefined;
  private _active: boolean = false;
  private _reconnectTimer: NodeJS.Timeout | null = null;
  private _onUsbAttach: (() => void) | null = null;
  private _onUsbDetach: (() => void) | null = null;

  // tap detection state
  private _touchOnAt: number = 0;
  private _rotatedDuringTouch: boolean = false;
  private _pressedDuringTouch: boolean = false;

  // rotation state
  private _lastPosition: number | null = null;

  // double-press state
  private _pendingPressTimer: NodeJS.Timeout | null = null;
  private _lastPressAt: number = 0;

  private constructor() {
    this.connect();
    this.registerHotplug();
  }

  private registerHotplug() {
    try {
      this._onUsbAttach = () => {
        if (this.isDeviceConnected()) return;
        if (this._reconnectTimer) clearTimeout(this._reconnectTimer);
        this._reconnectTimer = setTimeout(() => {
          this._reconnectTimer = null;
          if (!this.isDeviceConnected()) {
            info('[TimeBuzzerManager] USB attach detected — retrying connect');
            this.connect();
          }
        }, TimeBuzzerManager.HOTPLUG_SETTLE_MS);
      };
      this._onUsbDetach = () => {
        if (!this._device) return;
        info('[TimeBuzzerManager] USB detach detected — closing device');
        try { this._device.close(); } catch { /* ignore */ }
        this._device = undefined;
        this._active = false;
      };
      usb.on('attach', this._onUsbAttach);
      usb.on('detach', this._onUsbDetach);
    } catch (err) {
      error('[TimeBuzzerManager] Failed to register USB hotplug listeners', err);
    }
  }

  public static getInstance() {
    return this._instance || (this._instance = new this());
  }

  private connect() {
    info('[TimeBuzzerManager] Attempting to connect to timeBuzzer...');
    try {
      this._device = new TimeBuzzer((event: string, arg: any) => {
        this.handleEvent(event, arg);
      });
      this._active = true;
      info('[TimeBuzzerManager] timeBuzzer connected');
    } catch (err) {
      error('[TimeBuzzerManager] Failed to initialize timeBuzzer', err);
      this._device = undefined;
    }
  }

  private handleEvent(event: string, arg: any): void {
    switch (event) {
      case 'error':
        info(`[TimeBuzzerManager] No timeBuzzer available: ${arg}`);
        this._device = undefined;
        this._active = false;
        break;

      case 'touch':
        if (arg === true) {
          this._touchOnAt = Date.now();
          this._rotatedDuringTouch = false;
          this._pressedDuringTouch = false;
        } else {
          this.maybeFireTap();
        }
        break;

      case 'position':
        this._rotatedDuringTouch = true;
        this.handleRotation(arg as number);
        break;

      case 'press':
        // The device fires press on both depress and release.
        // We only act on the depress edge (true).
        if (arg === true) {
          this._pressedDuringTouch = true;
          this.handlePress();
        }
        break;

      default:
        break;
    }
  }

  // ---------- Tap (no-op — snapshot moved to press) ----------

  private maybeFireTap(): void {
    // Tap detection kept for future use; snapshot is triggered by press instead.
  }

  // ---------- Rotation (cycle tasks) ----------

  private handleRotation(position: number): void {
    if (this._lastPosition === null) {
      this._lastPosition = position;
      // First reading after connect — open the switcher anyway.
      TaskManager.getInstance().openSwitcher();
      return;
    }
    const delta = position - this._lastPosition;
    this._lastPosition = position;
    if (delta === 0) return;

    if (delta > 0) {
      TaskManager.getInstance().cycleNext();
    } else {
      TaskManager.getInstance().cyclePrev();
    }
  }

  // ---------- Press (edit / delete) ----------

  private handlePress(): void {
    const now = Date.now();
    const isDouble =
      now - this._lastPressAt < TimeBuzzerManager.DOUBLE_PRESS_WINDOW_MS;
    this._lastPressAt = now;

    // If a single-press is queued and a second press arrives, treat as double.
    if (this._pendingPressTimer) {
      clearTimeout(this._pendingPressTimer);
      this._pendingPressTimer = null;
      if (isDouble) {
        info('[TimeBuzzerManager] double-press -> back / close');
        TaskManager.getInstance().pressBack();
        return;
      }
    }

    // Schedule single-press action; will fire if no second press arrives.
    this._pendingPressTimer = setTimeout(() => {
      this._pendingPressTimer = null;
      const tm = TaskManager.getInstance();
      if (tm.isSwitcherOpen()) {
        info('[TimeBuzzerManager] press -> select / drilldown');
        tm.pressSelect();
      } else {
        // Switcher closed: a single press starts a new task — opens the
        // name dialog and kicks off the usual task-creation flow (committing
        // the current task first if one is active).
        info('[TimeBuzzerManager] press -> start new task');
        tm.startNewTask();
      }
    }, TimeBuzzerManager.DOUBLE_PRESS_WINDOW_MS);
  }

  public isDeviceConnected(): boolean {
    return this._device !== undefined && this._active;
  }

  public stopMonitoring() {
    if (this._pendingPressTimer) {
      clearTimeout(this._pendingPressTimer);
      this._pendingPressTimer = null;
    }
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    try {
      if (this._onUsbAttach) usb.off('attach', this._onUsbAttach);
      if (this._onUsbDetach) usb.off('detach', this._onUsbDetach);
    } catch { /* ignore */ }
    this._onUsbAttach = null;
    this._onUsbDetach = null;
    if (this._device) {
      try {
        this._device.close();
      } catch (err) {
        error('[TimeBuzzerManager] Error closing timeBuzzer', err);
      }
      this._device = undefined;
    }
    this._active = false;
    info('[TimeBuzzerManager] Stopped monitoring');
  }
}
