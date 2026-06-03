/* Per-task edit view (Phase 2): title, artifacts, subtasks. */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import styles from './TaskEditView.module.scss';
import SnapshotEntity from '../../main/entity/Snapshot';

export default function TaskEditView() {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const id = Number(params.id);

  const [snapshot, setSnapshot] = useState<SnapshotEntity | null>(null);
  const [children, setChildren] = useState<SnapshotEntity[]>([]);
  const [name, setName] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(true);

  const isSubtask = useMemo(
    () => snapshot?.parentId != null,
    [snapshot]
  );

  async function load() {
    const snap: SnapshotEntity | null = await window.electron.ipcRenderer
      .invoke('get-snapshot-by-id', id);
    setSnapshot(snap);
    setName(snap?.name ?? '');

    if (snap) {
      const kids: SnapshotEntity[] = await window.electron.ipcRenderer
        .invoke('get-snapshot-children', snap.id);
      setChildren(kids ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (Number.isFinite(id)) {
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function commitName() {
    if (!snapshot) return;
    if (name.trim() === snapshot.name) return;
    await window.electron.ipcRenderer.invoke(
      'rename-snapshot',
      snapshot.id,
      name.trim() || `Task ${snapshot.id}`
    );
  }

  async function addSubtask() {
    if (!snapshot) return;
    const trimmed = newName.trim();
    if (!trimmed) return;
    await window.electron.ipcRenderer.invoke(
      'create-subtask',
      snapshot.id,
      trimmed
    );
    setNewName('');
    setShowAdd(false);
    await load();
  }

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.empty}>Loading...</div>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className={styles.page}>
        <div className={styles.topBar}>
          <button
            type="button"
            className={styles.backButton}
            onClick={() => navigate('/')}
          >
            Back
          </button>
        </div>
        <div className={styles.empty}>Task not found.</div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <button
          type="button"
          className={styles.backButton}
          onClick={() => {
            if (isSubtask && snapshot.parentId != null) {
              navigate(`/task/${snapshot.parentId}`);
            } else {
              navigate('/');
            }
          }}
        >
          {isSubtask ? 'Parent task' : 'All tasks'}
        </button>
        <input
          className={styles.titleInput}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          placeholder="Untitled task"
        />
      </div>

      {/* Subtasks */}
      {!isSubtask && (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTitle}>Subtasks</span>
            <button
              type="button"
              className={styles.addButton}
              onClick={() => setShowAdd((v) => !v)}
            >
              {showAdd ? 'Cancel' : 'Add subtask'}
            </button>
          </div>

          {showAdd && (
            <div className={styles.dialog}>
              <input
                autoFocus
                className={styles.dialogInput}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addSubtask();
                  if (e.key === 'Escape') {
                    setShowAdd(false);
                    setNewName('');
                  }
                }}
                placeholder="Subtask name"
              />
              <button
                type="button"
                className={styles.addButton}
                onClick={addSubtask}
                disabled={!newName.trim()}
              >
                Create
              </button>
            </div>
          )}

          {children.length === 0 && !showAdd && (
            <div className={styles.empty}>No subtasks yet.</div>
          )}

          <div className={styles.list}>
            {children.map((c) => (
              <div
                key={c.id}
                className={styles.subtaskRow}
                onClick={() => navigate(`/task/${c.id}`)}
              >
                <span className={styles.subtaskName}>
                  {c.name || `Task ${c.id}`}
                </span>
                <span className={styles.subtaskMeta}>open</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Artifacts */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>Artifacts</span>
        </div>

        {(snapshot.applications ?? []).length === 0 &&
          (snapshot.browsers ?? []).length === 0 &&
          (snapshot.ides ?? []).length === 0 && (
            <div className={styles.empty}>No artifacts captured.</div>
          )}

        {(snapshot.applications ?? []).map((app) => (
          <div key={`app-${app.id}`} className={styles.artifactGroup}>
            <div className={styles.groupName}>
              {app.icon && (
                <img className={styles.groupIcon} src={app.icon} alt="" />
              )}
              {app.title || app.name}
            </div>
            {(app.files ?? []).map((f) => (
              <div key={`file-${f.id}`} className={styles.artifactItem}>
                <span>{f.name || f.path}</span>
              </div>
            ))}
          </div>
        ))}

        {(snapshot.browsers ?? []).map((b) => (
          <div key={`browser-${b.id}`} className={styles.artifactGroup}>
            <div className={styles.groupName}>
              {(b as unknown as { name?: string }).name ?? 'Browser'}
            </div>
            {(b.browserTabs ?? []).map((t) => (
              <div key={`tab-${t.id}`} className={styles.artifactItem}>
                <span>{t.title || t.url}</span>
              </div>
            ))}
          </div>
        ))}

        {(snapshot.ides ?? []).map((ide) => (
          <div key={`ide-${ide.id}`} className={styles.artifactGroup}>
            <div className={styles.groupName}>
              {(ide as unknown as { name?: string }).name ?? 'IDE'}
            </div>
            {(ide.ideFiles ?? []).map((f) => (
              <div key={`idefile-${f.id}`} className={styles.artifactItem}>
                <span>{f.name || f.path}</span>
              </div>
            ))}
          </div>
        ))}
      </section>
    </div>
  );
}
