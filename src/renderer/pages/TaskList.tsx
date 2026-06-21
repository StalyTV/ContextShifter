/* Phase 1 task list: most recently edited / created snapshots, top-down. */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './TaskList.module.scss';
import SnapshotEntity from '../../main/entity/Snapshot';
import ExtensionsStatus from '../../types/ExtensionsStatus';
import StartTaskDialog from '../components/StartTaskDialog';
import CommitTaskDialog from '../components/CommitTaskDialog';
import SettingsDrawer from '../components/SettingsDrawer';
import TaskActionButtons from '../components/TaskActionButtons';
import ConfirmDialog from '../components/ConfirmDialog';

type ActiveTask = { id: number; name: string } | null;
type PendingAction =
  | { kind: 'none' }
  | { kind: 'start'; parentId: number | null }
  | { kind: 'resume'; taskId: number };

const MAX_ICONS = 6;

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatTaskDate(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  if (isSameDay(d, new Date())) {
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `Today at ${hh}:${mm}`;
  }
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
}

type IconRef = { id: string; src?: string; label: string };

function gatherIcons(snapshot: SnapshotEntity): IconRef[] {
  const icons: IconRef[] = [];

  for (const app of snapshot.applications ?? []) {
    icons.push({
      id: `app-${app.id}`,
      src: app.icon,
      label: app.name ?? app.title ?? 'app',
    });
  }
  for (const browser of snapshot.browsers ?? []) {
    const b = browser as unknown as { icon?: string; name?: string; type?: string };
    icons.push({
      id: `browser-${browser.id}`,
      src: b.icon,
      label: b.name ?? b.type ?? 'browser',
    });
  }
  for (const ide of snapshot.ides ?? []) {
    const i = ide as unknown as { icon?: string; name?: string; workspaceName?: string };
    icons.push({
      id: `ide-${ide.id}`,
      src: i.icon,
      label: i.workspaceName ?? i.name ?? 'ide',
    });
  }
  return icons;
}

export default function TaskList() {
  const [snapshots, setSnapshots] = useState<SnapshotEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [extStatus, setExtStatus] = useState<ExtensionsStatus | null>(null);
  const [showStartTask, setShowStartTask] = useState(false);
  const [startTaskParentId, setStartTaskParentId] = useState<number | null>(
    null
  );
  const [showCommitTask, setShowCommitTask] = useState(false);
  // After the user commits artefacts for the previous task, this captures
  // what should happen next (start a new task, resume another, or nothing).
  const [pendingAfterCommit, setPendingAfterCommit] = useState<PendingAction>({
    kind: 'none',
  });
  const [activeTask, setActiveTask] = useState<ActiveTask>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<SnapshotEntity | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result: SnapshotEntity[] = await window.electron.ipcRenderer
          .invoke('get-latest-n-snapshots', 50);
        if (cancelled) return;
        const sorted = [...(result ?? [])].sort((a, b) => {
          const ta = new Date(a.lastChange ?? a.created).getTime();
          const tb = new Date(b.lastChange ?? b.created).getTime();
          return tb - ta;
        });
        setSnapshots(sorted);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const s: ExtensionsStatus = await window.electron.ipcRenderer.invoke(
        'get-extensions-status'
      );
      if (alive) setExtStatus(s);
    };
    tick();
    const id = setInterval(tick, 3000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const onChanged = () => setReloadKey((k) => k + 1);
    (window as any).electron.onSnapshotsChanged(onChanged);
    return () => (window as any).electron.removeOnSnapshotsChanged();
  }, []);

  // Backward-compat: widget still emits 'open-new-task-dialog' on the
  // legacy code path; route it through the new start flow.
  useEffect(() => {
    const onOpen = (_e: unknown, parentId: number | null) => {
      setStartTaskParentId(parentId ?? null);
      setShowStartTask(true);
    };
    (window as any).electron.onOpenNewTaskDialog(onOpen);
    return () => (window as any).electron.removeOnOpenNewTaskDialog();
  }, []);

  useEffect(() => {
    const onOpen = (_e: unknown, parentId: number | null) => {
      setStartTaskParentId(parentId ?? null);
      setPendingAfterCommit({ kind: 'none' });
      setShowStartTask(true);
    };
    (window as any).electron.onOpenStartTaskDialog(onOpen);
    return () => (window as any).electron.removeOnOpenStartTaskDialog();
  }, []);

  useEffect(() => {
    const onOpen = (_e: unknown, action: PendingAction) => {
      setPendingAfterCommit(action ?? { kind: 'none' });
      setShowCommitTask(true);
    };
    (window as any).electron.onOpenCommitTaskDialog(onOpen);
    return () => (window as any).electron.removeOnOpenCommitTaskDialog();
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const t = (await window.electron.ipcRenderer.invoke(
        'get-active-task'
      )) as ActiveTask;
      if (alive) setActiveTask(t);
    })();
    const handler = (_e: unknown, task: ActiveTask) => {
      setActiveTask(task);
    };
    (window as any).electron.onActiveTaskChanged(handler);
    return () => {
      alive = false;
      (window as any).electron.removeOnActiveTaskChanged();
    };
  }, []);

  const handleStartButton = () => {
    if (activeTask) {
      // Stopping the current task -> commit picker, no follow-up start.
      setPendingAfterCommit({ kind: 'none' });
      setShowCommitTask(true);
    } else {
      setStartTaskParentId(null);
      setPendingAfterCommit({ kind: 'none' });
      setShowStartTask(true);
    }
  };

  const handleTaskRowClick = (taskId: number) => {
    if (activeTask && activeTask.id !== taskId) {
      // Switching -> commit current task first, then resume the chosen task.
      setPendingAfterCommit({ kind: 'resume', taskId });
      setShowCommitTask(true);
      return;
    }
    navigate(`/task/${taskId}`);
  };

  // Explicit "Activate" button: make the task active (restoring its context).
  // If another task is active, commit it first via the picker.
  const handleActivate = async (taskId: number) => {
    if (activeTask?.id === taskId) return;
    if (activeTask) {
      setPendingAfterCommit({ kind: 'resume', taskId });
      setShowCommitTask(true);
      return;
    }
    try {
      await window.electron.ipcRenderer.invoke('resume-task', taskId);
      setReloadKey((k) => k + 1);
    } catch {
      // best-effort
    }
  };

  // Pause (deactivate) the active task -> commit picker -> None.
  const handleStop = () => {
    setPendingAfterCommit({ kind: 'none' });
    setShowCommitTask(true);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleteTarget(null);
    try {
      await window.electron.ipcRenderer.invoke('delete-snapshot', id);
    } finally {
      setReloadKey((k) => k + 1);
    }
  };

  const finalisePendingAction = async () => {
    const action = pendingAfterCommit;
    setPendingAfterCommit({ kind: 'none' });
    if (action.kind === 'start') {
      setStartTaskParentId(action.parentId);
      setShowStartTask(true);
    } else if (action.kind === 'resume') {
      try {
        const snap = await window.electron.ipcRenderer.invoke(
          'resume-task',
          action.taskId
        );
        // Open the task detail view of the resumed task.
        if (snap && typeof (snap as any).id === 'number') {
          navigate(`/task/${(snap as any).id}`);
        }
      } catch {
        // best-effort
      }
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Tasks</h1>
        <div className={styles.headerRight}>
          <span className={styles.count}>
            {loading ? '...' : `${snapshots.length} total`}
          </span>
          <button
            type="button"
            className={styles.newButton}
            onClick={handleStartButton}
          >
            {activeTask ? `Stop "${activeTask.name}"` : 'Start new task'}
          </button>
          <button
            type="button"
            className={styles.iconButton}
            title="Settings"
            aria-label="Settings"
            onClick={() => setShowSettings(true)}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </div>

      {!loading && snapshots.length === 0 && (
        <div className={styles.empty}>No tasks yet.</div>
      )}

      <div className={styles.list}>
        {snapshots.map((s) => {
          const icons = gatherIcons(s);
          const visible = icons.slice(0, MAX_ICONS);
          const remaining = icons.length - visible.length;
          return (
            <div
              key={s.id}
              className={`${styles.row} ${
                activeTask?.id === s.id ? styles.rowActive : ''
              }`}
              onClick={() => handleTaskRowClick(s.id)}
            >
              <div className={styles.body}>
                <div className={styles.name}>
                  {activeTask?.id === s.id && (
                    <span className={styles.activeBadge}>Active</span>
                  )}
                  {s.name || `Task ${s.id}`}
                </div>
                {visible.length > 0 && (
                  <ul className={styles.artifactList}>
                    {visible.map((ic) => (
                      <li key={ic.id} className={styles.artifact} title={ic.label}>
                        {ic.src ? (
                          <img
                            className={styles.icon}
                            src={ic.src}
                            alt=""
                          />
                        ) : (
                          <span className={styles.iconFallback}>
                            {ic.label.slice(0, 1).toUpperCase()}
                          </span>
                        )}
                        <span className={styles.artifactLabel}>{ic.label}</span>
                      </li>
                    ))}
                    {remaining > 0 && (
                      <li className={styles.more}>+{remaining} more</li>
                    )}
                  </ul>
                )}
              </div>
              <span className={styles.timestamps}>
                <span className={styles.timestampLine}>
                  <span className={styles.timestampLabel}>Created on:</span>{' '}
                  {formatTaskDate(s.created)}
                </span>
                <span className={styles.timestampLine}>
                  <span className={styles.timestampLabel}>Last worked on:</span>{' '}
                  {formatTaskDate(s.lastChange ?? s.created)}
                </span>
              </span>
              <TaskActionButtons
                isActive={activeTask?.id === s.id}
                onActivate={() => handleActivate(s.id)}
                onStop={handleStop}
                onDelete={() => setDeleteTarget(s)}
              />
            </div>
          );
        })}
      </div>

      <div className={styles.statusBar}>
        <span className={styles.statusItem}>
          <span
            className={`${styles.dot} ${extStatus?.isVSCodeConnected ? styles.dotOn : ''}`}
          />
          VS Code
        </span>
        <span className={styles.statusItem}>
          <span
            className={`${styles.dot} ${extStatus?.isBrowserConnected ? styles.dotOn : ''}`}
          />
          Browser
        </span>
      </div>

      {showStartTask && (
        <StartTaskDialog
          onClose={() => setShowStartTask(false)}
          onStarted={() => {
            setShowStartTask(false);
            setReloadKey((k) => k + 1);
          }}
          parentId={startTaskParentId}
          parentName={
            startTaskParentId !== null
              ? snapshots.find((s) => s.id === startTaskParentId)?.name ?? null
              : null
          }
        />
      )}

      {showCommitTask && (
        <CommitTaskDialog
          onClose={async () => {
            setShowCommitTask(false);
            await finalisePendingAction();
            setReloadKey((k) => k + 1);
          }}
          onCommitted={async () => {
            setShowCommitTask(false);
            await finalisePendingAction();
            setReloadKey((k) => k + 1);
          }}
        />
      )}

      <SettingsDrawer
        open={showSettings}
        onClose={() => setShowSettings(false)}
      />

      {deleteTarget && (
        <ConfirmDialog
          title="Delete task"
          message={`Delete "${
            deleteTarget.name || `Task ${deleteTarget.id}`
          }"? This also removes its subtasks and captured artefacts. This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
