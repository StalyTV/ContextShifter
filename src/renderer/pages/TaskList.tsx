/* Phase 1 task list: most recently edited / created snapshots, top-down. */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './TaskList.module.scss';
import SnapshotEntity from '../../main/entity/Snapshot';

const MAX_ICONS = 5;

function formatRelative(iso: string | undefined): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = Date.now() - then;
  const min = Math.round(diffMs / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.round(hr / 24);
  return `${d}d ago`;
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
    icons.push({
      id: `browser-${browser.id}`,
      label: (browser as unknown as { name?: string }).name ?? 'browser',
    });
  }
  for (const ide of snapshot.ides ?? []) {
    icons.push({
      id: `ide-${ide.id}`,
      label: (ide as unknown as { name?: string }).name ?? 'ide',
    });
  }
  return icons;
}

export default function TaskList() {
  const [snapshots, setSnapshots] = useState<SnapshotEntity[]>([]);
  const [loading, setLoading] = useState(true);
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
  }, []);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Tasks</h1>
        <span className={styles.count}>
          {loading ? '...' : `${snapshots.length} total`}
        </span>
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
                <div className={styles.iconStrip}>
                  {visible.map((ic) =>
                    ic.src ? (
                      <img
                        key={ic.id}
                        className={styles.icon}
                        src={ic.src}
                        alt={ic.label}
                        title={ic.label}
                      />
                    ) : (
                      <span
                        key={ic.id}
                        className={styles.iconFallback}
                        title={ic.label}
                      >
                        {ic.label.slice(0, 1).toUpperCase()}
                      </span>
                    )
                  )}
                  {remaining > 0 && (
                    <span className={styles.more}>+{remaining}</span>
                  )}
                </div>
              </div>
              <span className={styles.timestamp}>
                {formatRelative(s.lastChange ?? s.created)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
