import { info, error } from 'electron-log';
import { In } from 'typeorm';
import Snapshot from './entity/Snapshot';
import WindowManager from './WindowManager';

type SwitcherItem = { id: number | null; name: string };

/**
 * Sentinel id for the synthetic "New Task" entry shown at the end of the
 * parent carousel. Selecting it (single press, or auto-commit after the
 * rotation idle window) creates a new top-level Snapshot from the currently
 * open artifacts.
 */
const NEW_TASK_ID = -1;

/**
 * Sentinel id for the synthetic "New Subtask" entry appended to the child
 * carousel when a real parent task is highlighted. Selecting it creates an
 * empty subtask under the highlighted parent.
 */
const NEW_SUBTASK_ID = -2;

/**
 * TaskManager - drives the two-row task-switcher carousel with the TimeBuzzer.
 *
 * Top row: parent tasks (top-level Snapshots, parentId === null), most-recent first.
 *          Leading "None" entry represents "no active task".
 * Bottom row: subtasks of the currently highlighted parent.
 *
 * Modes:
 *  - 'parent': rotation cycles parents; subtasks below are dimmed/preview.
 *  - 'child' : rotation cycles subtasks of the locked-in parent.
 *
 * Press semantics (driven by HID -> TimeBuzzerManager):
 *  - parent mode + parent has children -> enterChildMode()
 *  - parent mode + parent has no children (or "None") -> commitSelection()
 *  - child mode -> commitSelection()
 *  - double-press in child mode -> exitChildMode()
 *  - double-press in parent mode -> closeSwitcher()
 *
 * After rotation idle of COMMIT_DELAY_MS the current selection auto-commits.
 */
export default class TaskManager {
  private static _instance: TaskManager;

  private static readonly COMMIT_DELAY_MS = 5000;

  private _activeSnapshotId: number | null = null;

  private _parents: (number | null)[] = [];
  private _parentIndex = 0;

  private _children: number[] = [];
  private _childIndex = 0;

  private _mode: 'parent' | 'child' = 'parent';
  private _switcherOpen = false;
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

  public getMode(): 'parent' | 'child' {
    return this._mode;
  }

  /** Currently highlighted id, taking mode into account. */
  public getSelectedSnapshotId(): number | null {
    if (!this._switcherOpen) return this._activeSnapshotId;
    if (this._mode === 'child') {
      return this._children[this._childIndex] ?? null;
    }
    return this._parents[this._parentIndex] ?? null;
  }

  // ---------- Switcher lifecycle ----------

  public async openSwitcher(): Promise<void> {
    if (this._switcherOpen) return;
    info('[TaskManager] Opening task switcher');

    await this.rebuildParents();
    await this.rebuildChildrenForCurrentParent();
    this._mode = 'parent';
    this._switcherOpen = true;

    WindowManager.createTaskSwitcherWindow();
    this.scheduleCommit();
    this.broadcastState();
  }

  public closeSwitcher(): void {
    if (!this._switcherOpen) return;
    info('[TaskManager] Closing task switcher (no commit)');
    this._switcherOpen = false;
    this._mode = 'parent';
    this.clearCommitTimer();
    WindowManager.closeTaskSwitcherWindow();
  }

  // ---------- Rotation ----------

  public async cycleNext(): Promise<void> {
    if (!this._switcherOpen) await this.openSwitcher();
    if (this._mode === 'child') {
      const len = Math.max(1, this._children.length);
      this._childIndex = (this._childIndex + 1) % len;
    } else {
      const len = Math.max(1, this._parents.length);
      this._parentIndex = (this._parentIndex + 1) % len;
      await this.rebuildChildrenForCurrentParent();
    }
    this.scheduleCommit();
    this.broadcastState();
  }

  public async cyclePrev(): Promise<void> {
    if (!this._switcherOpen) await this.openSwitcher();
    if (this._mode === 'child') {
      const len = Math.max(1, this._children.length);
      this._childIndex = (this._childIndex - 1 + len) % len;
    } else {
      const len = Math.max(1, this._parents.length);
      this._parentIndex = (this._parentIndex - 1 + len) % len;
      await this.rebuildChildrenForCurrentParent();
    }
    this.scheduleCommit();
    this.broadcastState();
  }

  // ---------- Commit / mode transitions ----------

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

  /** Single press semantics. */
  public async pressSelect(): Promise<void> {
    if (!this._switcherOpen) return;
    if (this._mode === 'parent') {
      const parentId = this._parents[this._parentIndex];
      if (parentId === NEW_TASK_ID) {
        await this.openNewTaskDialog(null);
        return;
      }
      if (parentId === null) {
        // "None" — commit (deactivate active task).
        await this.commitSelection();
        return;
      }
      // Any real parent: enter child mode. The child carousel always carries
      // the "+ New Subtask" sentinel, so navigation never dead-ends and the
      // user can always reach subtask creation.
      await this.enterChildMode();
      return;
    }
    // child mode
    const childId = this._children[this._childIndex];
    if (childId === NEW_SUBTASK_ID) {
      const parentId = this._parents[this._parentIndex];
      if (typeof parentId === 'number' && parentId !== NEW_TASK_ID) {
        await this.openNewTaskDialog(parentId);
      } else {
        this.closeSwitcher();
      }
      return;
    }
    await this.commitSelection();
  }

  /** Double-press semantics. */
  public pressBack(): void {
    if (!this._switcherOpen) return;
    if (this._mode === 'child') {
      this.exitChildMode();
      return;
    }
    this.closeSwitcher();
  }

  public async enterChildMode(): Promise<void> {
    if (!this._switcherOpen) return;
    if (this._children.length === 0) return;
    info('[TaskManager] Entering child mode');
    this._mode = 'child';
    this._childIndex = 0;
    this.scheduleCommit();
    this.broadcastState();
  }

  public exitChildMode(): void {
    if (!this._switcherOpen) return;
    if (this._mode !== 'child') return;
    info('[TaskManager] Exiting child mode');
    this._mode = 'parent';
    this.scheduleCommit();
    this.broadcastState();
  }

  /** Commit current selection (parent or child) as active. */
  public async commitSelection(): Promise<void> {
    if (!this._switcherOpen) return;
    const newActiveId = this.getSelectedSnapshotId();
    // Auto-commit landed on a synthetic "new" entry: hand off to the main
    // window dialog instead of activating a snapshot.
    if (newActiveId === NEW_TASK_ID) {
      await this.openNewTaskDialog(null);
      return;
    }
    if (newActiveId === NEW_SUBTASK_ID) {
      const parentId = this._parents[this._parentIndex];
      if (typeof parentId === 'number' && parentId !== NEW_TASK_ID) {
        await this.openNewTaskDialog(parentId);
      } else {
        this.closeSwitcher();
      }
      return;
    }
    info(`[TaskManager] Committing snapshot selection: ${newActiveId}`);
    this._activeSnapshotId = newActiveId;
    this._switcherOpen = false;
    this._mode = 'parent';
    this.clearCommitTimer();
    WindowManager.closeTaskSwitcherWindow();

    if (typeof newActiveId === 'number') {
      try {
        const snap = await Snapshot.findOneBy({ id: newActiveId });
        if (snap) {
          snap.lastChange = new Date().toISOString();
          await snap.save();
          WindowManager.mainWindow?.webContents.send('snapshots-changed');
        }
      } catch (err) {
        error('[TaskManager] Failed to bump lastChange on activation', err);
      }
    }
  }

  /**
   * Hand off task/subtask creation to the main window dialog. We close the
   * switcher, raise the main window, and emit an event the renderer listens
   * to in TaskList. `parentId === null` means "new top-level task";
   * otherwise the dialog opens scoped to that parent and creates a subtask.
   */
  private async openNewTaskDialog(parentId: number | null): Promise<void> {
    info(`[TaskManager] Handing off to NewTaskDialog (parentId=${parentId})`);
    this._switcherOpen = false;
    this._mode = 'parent';
    this.clearCommitTimer();
    WindowManager.closeTaskSwitcherWindow();
    try {
      if (WindowManager.mainWindow === null) {
        await WindowManager.createMainWindow();
      } else {
        WindowManager.mainWindow.show();
        WindowManager.mainWindow.focus();
      }
      WindowManager.mainWindow?.webContents.send(
        'open-new-task-dialog',
        parentId
      );
    } catch (err) {
      error('[TaskManager] Failed to open new-task dialog', err);
    }
  }

  // ---------- Carousel construction & broadcast ----------

  private async rebuildParents(): Promise<void> {
    const parents = await Snapshot.getLatestNSnapshots(50);
    // Layout: "None" → existing tasks → "New Task" sentinel at the end.
    this._parents = [null, ...parents.map((s) => s.id), NEW_TASK_ID];
    const activeIdx = this._parents.findIndex(
      (x) => x === this._activeSnapshotId
    );
    this._parentIndex = activeIdx >= 0 ? activeIdx : 0;
  }

  private async rebuildChildrenForCurrentParent(): Promise<void> {
    const parentId = this._parents[this._parentIndex];
    if (
      parentId === null ||
      parentId === undefined ||
      parentId === NEW_TASK_ID
    ) {
      this._children = [];
      this._childIndex = 0;
      return;
    }
    const kids = await Snapshot.getChildrenOf(parentId);
    // Append "+ New Subtask" sentinel so the user can create subtasks from
    // the widget by rotating to the last child slot.
    this._children = [...kids.map((k) => k.id), NEW_SUBTASK_ID];
    this._childIndex = 0;
  }

  private async broadcastState(): Promise<void> {
    try {
      const parentIds = this._parents.filter(
        (x): x is number => x !== null && x !== NEW_TASK_ID
      );
      const childIds = this._children.filter(
        (x): x is number => x !== NEW_SUBTASK_ID
      );
      const allIds = [...parentIds, ...childIds];
      const snaps = allIds.length
        ? await Snapshot.find({ where: { id: In(allIds) } })
        : [];
      const nameOf = new Map(snaps.map((s) => [s.id, s.name] as const));

      const parents: SwitcherItem[] = this._parents.map((id) => {
        if (id === null) return { id: null, name: 'None' };
        if (id === NEW_TASK_ID) return { id: NEW_TASK_ID, name: '+ New Task' };
        return { id, name: nameOf.get(id) ?? `Task ${id}` };
      });
      const children: SwitcherItem[] = this._children.map((id) => {
        if (id === NEW_SUBTASK_ID) {
          return { id: NEW_SUBTASK_ID, name: '+ New Subtask' };
        }
        return { id, name: nameOf.get(id) ?? `Subtask ${id}` };
      });

      WindowManager.taskSwitcherWindow?.webContents.send(
        'task-switcher-state',
        {
          parents,
          parentIndex: this._parentIndex,
          children,
          childIndex: this._childIndex,
          mode: this._mode,
          activeTaskId: this._activeSnapshotId,
        }
      );
    } catch (err) {
      error('[TaskManager] Failed to broadcast state', err);
    }
  }
}
