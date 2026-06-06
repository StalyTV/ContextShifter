/* Phase 1 task list: most recently edited / created snapshots, top-down. */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './TaskList.module.scss';
import SnapshotEntity from '../../main/entity/Snapshot';
import ExtensionsStatus from '../../types/ExtensionsStatus';
import NewTaskDialog from '../components/NewTaskDialog';
import SettingsDrawer from '../components/SettingsDrawer';

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
  const [showNewTask, setShowNewTask] = useState(false);
  const [newTaskParentId, setNewTaskParentId] = useState<number | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
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

  useEffect(() => {
    const onOpen = (_e: unknown, parentId: number | null) => {
      setNewTaskParentId(parentId ?? null);
      setShowNewTask(true);
    };
    (window as any).electron.onOpenNewTaskDialog(onOpen);
    return () => (window as any).electron.removeOnOpenNewTaskDialog();
  }, []);

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
            onClick={() => {
              setNewTaskParentId(null);
              setShowNewTask(true);
            }}
          >
            + New task
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
              className={styles.row}
              onClick={() => navigate(`/task/${s.id}`)}
            >
              <div className={styles.body}>
                <div className={styles.name}>{s.name || `Task ${s.id}`}</div>
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

      {showNewTask && (
        <NewTaskDialog
          onClose={() => setShowNewTask(false)}
          onCreated={() => {
            setShowNewTask(false);
            setReloadKey((k) => k + 1);
          }}
          parentId={newTaskParentId}
          parentName={
            newTaskParentId !== null
              ? snapshots.find((s) => s.id === newTaskParentId)?.name ?? null
              : null
          }
        />
      )}

      <SettingsDrawer
        open={showSettings}
        onClose={() => setShowSettings(false)}
      />
    </div>
  );
}
