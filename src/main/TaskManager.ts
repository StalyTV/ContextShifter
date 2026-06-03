import { info, error } from 'electron-log';
import Snapshot from './entity/Snapshot';
import SnapshotManager from './SnapshotManager';
import WindowManager from './WindowManager';
import { UsageDataOrigin } from '../types/UsageDataOrigin';

/**
 * TaskManager - drives the task-switcher carousel with the TimeBuzzer.
 *
 * "Tasks" here are the existing Snapshot records (most-recently-changed first).
 * Carousel order (in-memory): [None, ...snapshots]
 * Selection commits to "active" after `COMMIT_DELAY_MS` of no rotation.
 */
export default class TaskManager {
  private static _instance: TaskManager;

  private static readonly COMMIT_DELAY_MS = 5000;

  // Active (committed) snapshot id. null == "None".
  private _activeSnapshotId: number | null = null;

  // Carousel order while switcher is open: array of snapshot ids (null = None).
  private _carousel: (number | null)[] = [];
  private _selectedIndex: number = 0;

  // True while the overlay is shown and accepting rotation input.
  private _switcherOpen: boolean = false;

  private _commitTimer: NodeJS.Timeout | null = null;

  private constructor() {}

  public static getInstance() {
    return this._instance || (this._instance = new this());
  }

  public getActiveSnapshotId(): number | null {
    return this._activeSnapshotId;
  }

  public isSwitcherOpen(): boolean {
    return this._switcherOpen;
  }

  /** Get the currently highlighted snapshot id in the carousel (only while open). */
  public getSelectedSnapshotId(): number | null {
    if (!this._switcherOpen) return this._activeSnapshotId;
    return this._carousel[this._selectedIndex] ?? null;
  }

  // ---------- Switcher lifecycle ----------

  /** Open the switcher overlay (called when rotation begins). */
  public async openSwitcher(): Promise<void> {
    if (this._switcherOpen) return;

    info('[TaskManager] Opening task switcher');
    await this.rebuildCarousel();
    this._switcherOpen = true; // set before creating window so cycleNext/Prev don't re-enter

    WindowManager.createTaskSwitcherWindow(); // fire-and-forget
    this.scheduleCommit();
    this.broadcastState();
  }

  /** Close the switcher without committing. */
  public closeSwitcher(): void {
    if (!this._switcherOpen) return;
    info('[TaskManager] Closing task switcher (no commit)');
    this._switcherOpen = false;
    this.clearCommitTimer();
    WindowManager.closeTaskSwitcherWindow();
  }

  // ---------- Rotation ----------

  public async cycleNext(): Promise<void> {
    if (!this._switcherOpen) await this.openSwitcher();
    this._selectedIndex =
      (this._selectedIndex + 1) % Math.max(1, this._carousel.length);
    this.scheduleCommit();
    this.broadcastState();
  }

  public async cyclePrev(): Promise<void> {
    if (!this._switcherOpen) await this.openSwitcher();
    const len = Math.max(1, this._carousel.length);
    this._selectedIndex = (this._selectedIndex - 1 + len) % len;
    this.scheduleCommit();
    this.broadcastState();
  }

  // ---------- Commit / selection ----------

  private scheduleCommit(): void {
    this.clearCommitTimer();
    this._commitTimer = setTimeout(() => {
      this.commitSelection();
    }, TaskManager.COMMIT_DELAY_MS);
  }

  private clearCommitTimer(): void {
    if (this._commitTimer) {
      clearTimeout(this._commitTimer);
      this._commitTimer = null;
    }
  }

  /** Commit currently highlighted snapshot as active. */
  public async commitSelection(): Promise<void> {
    if (!this._switcherOpen) return;
    const newActiveId = this.getSelectedSnapshotId();
    info(`[TaskManager] Committing snapshot selection: ${newActiveId}`);

    this._activeSnapshotId = newActiveId;
    this._switcherOpen = false;
    this.clearCommitTimer();
    WindowManager.closeTaskSwitcherWindow();
  }

  // ---------- Press actions ----------

  /** Single press while switcher is open: open the existing Snapshot edit window. */
  public async openEditForSelected(): Promise<void> {
    const id = this.getSelectedSnapshotId();
    this.closeSwitcher();

    if (id === null) return; // "None" selected — nothing to edit

    await SnapshotManager.getInstance().openSnapshotInSnapshotWindow(id);
  }

  /** Double-press while switcher is open: delete selected snapshot. */
  public async deleteSelected(): Promise<void> {
    const id = this.getSelectedSnapshotId();
    this.closeSwitcher();
    if (id === null) return; // can't delete "None"

    info(`[TaskManager] Deleting snapshot ${id}`);
    try {
      await SnapshotManager.getInstance().deleteSnapshot(
        id,
        UsageDataOrigin.USBDevice
      );
    } catch (err) {
      error('[TaskManager] Failed to delete snapshot', err);
    }
    if (this._activeSnapshotId === id) {
      this._activeSnapshotId = null;
    }
  }

  // ---------- Carousel construction & broadcast ----------

  private async rebuildCarousel(): Promise<void> {
    const snapshots = await Snapshot.find({
      where: { isArchived: false },
      order: { lastChange: 'DESC' },
    });
    // [None, snap1, snap2, ...]
    this._carousel = [null, ...snapshots.map((s) => s.id)];
    // Start selection on the currently active snapshot (or None).
    const activeIdx = this._carousel.findIndex(
      (x) => x === this._activeSnapshotId
    );
    this._selectedIndex = activeIdx >= 0 ? activeIdx : 0;
  }

  private async broadcastState(): Promise<void> {
    try {
      const snapshots = await Snapshot.find({
        where: { isArchived: false },
        order: { lastChange: 'DESC' },
      });
      const snapMap = new Map(snapshots.map((s) => [s.id, s]));
      const items = this._carousel.map((id) => {
        if (id === null) return { id: null, name: 'None' };
        const s = snapMap.get(id);
        return { id, name: s ? s.name : `Snapshot ${id}` };
      });

      WindowManager.taskSwitcherWindow?.webContents.send(
        'task-switcher-state',
        {
          items,
          selectedIndex: this._selectedIndex,
          activeTaskId: this._activeSnapshotId,
        }
      );
    } catch (err) {
      error('[TaskManager] Failed to broadcast state', err);
    }
  }
}
