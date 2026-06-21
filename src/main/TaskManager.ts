import { info, error } from 'electron-log';
import { globalShortcut } from 'electron';
import { In } from 'typeorm';
import Snapshot from './entity/Snapshot';
import WindowManager from './WindowManager';
import ActiveTaskSession from './ActiveTaskSession';
import TaskRestorer from './TaskRestorer';

// Keys that drive the switcher while it's open (like turning/pressing the dial).
const SWITCHER_SHORTCUTS = ['Right', 'Down', 'Left', 'Up', 'Return', 'Escape'];

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

  private static readonly COMMIT_DELAY_MS = 3000;

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
    // ActiveTaskSession is the source of truth for the active task; the
    // local copy is kept in sync for parent-carousel positioning.
    return ActiveTaskSession.getInstance().getActiveTaskId();
  }

  public isSwitcherOpen(): boolean {
    return this._switcherOpen;
  }

  public getMode(): 'parent' | 'child' {
    return this._mode;
  }

  /** Currently highlighted id, taking mode into account. */
  public getSelectedSnapshotId(): number | null {
    if (!this._switcherOpen) return this.getActiveSnapshotId();
    if (this._mode === 'child') {
      return this._children[this._childIndex] ?? null;
    }
    return this._parents[this._parentIndex] ?? null;
  }

  /**
   * Begin creating a new top-level task. Mirrors selecting the "New Task"
   * sentinel in the switcher: if a task is currently active, the user goes
   * through the commit picker first (so the active task's artefacts are saved)
   * and then the start dialog; otherwise the start dialog opens directly.
   *
   * Used by the TimeBuzzer single-press when the switcher is closed.
   */
  public async startNewTask(): Promise<void> {
    if (this._switcherOpen) this.closeSwitcher();
    const currentActive = ActiveTaskSession.getInstance().getActiveTaskId();
    info('[TaskManager] startNewTask (press); active=' + currentActive);
    if (currentActive !== null) {
      await this.openCommitDialog({ kind: 'start', parentId: null });
    } else {
      await this.openStartTaskDialog(null);
    }
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
    this.registerSwitcherShortcuts();
    this.scheduleCommit();
    this.broadcastState();
  }

  public closeSwitcher(): void {
    if (!this._switcherOpen) return;
    info('[TaskManager] Closing task switcher (no commit)');
    this._switcherOpen = false;
    this._mode = 'parent';
    this.clearCommitTimer();
    this.closeSwitcherWindow();
  }

  /** Tear down the overlay window and release the arrow-key shortcuts. */
  private closeSwitcherWindow(): void {
    this.unregisterSwitcherShortcuts();
    WindowManager.closeTaskSwitcherWindow();
  }

  /**
   * While the widget is open, arrow keys drive it like turning the dial and
   * Enter/Escape act like press/back. Registered globally so the focusless
   * overlay still responds; released as soon as the widget closes.
   */
  private registerSwitcherShortcuts(): void {
    try {
      globalShortcut.register('Right', () => this.cycleNext());
      globalShortcut.register('Down', () => this.cycleNext());
      globalShortcut.register('Left', () => this.cyclePrev());
      globalShortcut.register('Up', () => this.cyclePrev());
      globalShortcut.register('Return', () => this.pressSelect());
      globalShortcut.register('Escape', () => this.pressBack());
    } catch (err) {
      error('[TaskManager] Failed to register switcher shortcuts', err);
    }
  }

  private unregisterSwitcherShortcuts(): void {
    for (const key of SWITCHER_SHORTCUTS) {
      try {
        globalShortcut.unregister(key);
      } catch {
        /* ignore */
      }
    }
  }

  /**
   * Stop the active task from outside the widget (e.g. the tray "Stop Task").
   * Routes through the commit picker, ending at "None".
   */
  public async stopActiveTask(): Promise<void> {
    if (!ActiveTaskSession.getInstance().isActive()) return;
    await this.openCommitDialog({ kind: 'none' });
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
    const currentActive = ActiveTaskSession.getInstance().getActiveTaskId();

    // Sentinels: route to start dialog. If a task is currently active, the
    // sentinel means "stop" first; the post-commit action then starts the
    // new task.
    if (newActiveId === NEW_TASK_ID) {
      if (currentActive !== null) {
        // "Stop current task": commit the active task's artefacts and drop to
        // None. Do NOT start another task; just close the widget.
        await this.openCommitDialog({ kind: 'none' });
      } else {
        await this.openStartTaskDialog(null);
      }
      return;
    }
    if (newActiveId === NEW_SUBTASK_ID) {
      const parentId = this._parents[this._parentIndex];
      if (typeof parentId === 'number' && parentId !== NEW_TASK_ID) {
        if (currentActive !== null) {
          await this.openCommitDialog({ kind: 'start', parentId });
        } else {
          await this.openStartTaskDialog(parentId);
        }
      } else {
        this.closeSwitcher();
      }
      return;
    }

    // Switching away from an active task -> open commit picker. If the user
    // picked a real task, also resume it after commit. "None" just commits
    // and stops with no follow-up.
    if (currentActive !== null && currentActive !== newActiveId) {
      info(
        `[TaskManager] Switching from active task ${currentActive} -> ${newActiveId}; opening commit picker`
      );
      this._switcherOpen = false;
      this._mode = 'parent';
      this.clearCommitTimer();
      this.closeSwitcherWindow();
      if (typeof newActiveId === 'number') {
        await this.openCommitDialog({ kind: 'resume', taskId: newActiveId });
      } else {
        await this.openCommitDialog({ kind: 'none' });
      }
      return;
    }

    // No active task -> activate the selected one (or "None") directly.
    info(`[TaskManager] Committing snapshot selection: ${newActiveId}`);
    this._switcherOpen = false;
    this._mode = 'parent';
    this.clearCommitTimer();
    this.closeSwitcherWindow();

    if (typeof newActiveId === 'number') {
      try {
        const snap = await Snapshot.findOneBy({ id: newActiveId });
        if (snap) {
          snap.lastChange = new Date().toISOString();
          await snap.save();
          await ActiveTaskSession.getInstance().resume(snap.id, snap.name);
          WindowManager.mainWindow?.webContents.send('snapshots-changed');
          // Restore the task's context (open its artefacts, close the rest).
          await TaskRestorer.restore(snap.id);
        }
      } catch (err) {
        error('[TaskManager] Failed to bump lastChange on activation', err);
      }
    }
    // Selected "None" with no active task is a no-op.
  }

  /**
   * Hand off start-task to the main window's StartTaskDialog. parentId !== null
   * scopes the new task as a subtask under that parent.
   */
  private async openStartTaskDialog(parentId: number | null): Promise<void> {
    info(`[TaskManager] Handing off to StartTaskDialog (parentId=${parentId})`);
    this._switcherOpen = false;
    this._mode = 'parent';
    this.clearCommitTimer();
    this.closeSwitcherWindow();
    try {
      if (WindowManager.mainWindow === null) {
        await WindowManager.createMainWindow();
      } else {
        WindowManager.mainWindow.show();
        WindowManager.mainWindow.focus();
      }
      WindowManager.mainWindow?.webContents.send(
        'open-start-task-dialog',
        parentId
      );
    } catch (err) {
      error('[TaskManager] Failed to open start-task dialog', err);
    }
  }

  /**
   * Hand off commit-task to the main window's CommitTaskDialog. The renderer
   * is responsible for calling stop-task to fetch the bundle.
   */
  private async openCommitDialog(
    action:
      | { kind: 'none' }
      | { kind: 'start'; parentId: number | null }
      | { kind: 'resume'; taskId: number }
  ): Promise<void> {
    info(`[TaskManager] Handing off to CommitTaskDialog (action=${action.kind})`);
    // Always tear down the switcher widget when handing off to the commit
    // dialog, so it never lingers behind the dialog.
    this._switcherOpen = false;
    this._mode = 'parent';
    this.clearCommitTimer();
    this.closeSwitcherWindow();
    try {
      if (WindowManager.mainWindow === null) {
        await WindowManager.createMainWindow();
      } else {
        WindowManager.mainWindow.show();
        WindowManager.mainWindow.focus();
      }
      WindowManager.mainWindow?.webContents.send(
        'open-commit-task-dialog',
        action
      );
    } catch (err) {
      error('[TaskManager] Failed to open commit-task dialog', err);
    }
  }

  /**
   * Legacy hand-off retained for any callers still pointing at the
   * pre-active-task picker; routes to the start dialog so the user gets the
   * new flow regardless.
   */
  private async openNewTaskDialog(parentId: number | null): Promise<void> {
    await this.openStartTaskDialog(parentId);
  }

  // ---------- Carousel construction & broadcast ----------

  private async rebuildParents(): Promise<void> {
    const parents = await Snapshot.getLatestNSnapshots(50);
    // Layout: "None" → existing tasks → "New Task" sentinel at the end.
    this._parents = [null, ...parents.map((s) => s.id), NEW_TASK_ID];
    const activeId = this.getActiveSnapshotId();
    const activeIdx = this._parents.findIndex((x) => x === activeId);
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
        if (id === NEW_TASK_ID) {
          const hasActive =
            ActiveTaskSession.getInstance().getActiveTaskId() !== null;
          return {
            id: NEW_TASK_ID,
            name: hasActive ? 'Stop current task' : 'Start new task',
          };
        }
        return { id, name: nameOf.get(id) ?? `Task ${id}` };
      });
      const children: SwitcherItem[] = this._children.map((id) => {
        if (id === NEW_SUBTASK_ID) {
          return { id: NEW_SUBTASK_ID, name: 'Start new subtask' };
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
          activeTaskId: this.getActiveSnapshotId(),
        }
      );
    } catch (err) {
      error('[TaskManager] Failed to broadcast state', err);
    }
  }
}
