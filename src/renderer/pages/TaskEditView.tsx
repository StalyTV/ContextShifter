/* Per-task edit view (Phase 2): title, artifacts, subtasks. */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import styles from './TaskEditView.module.scss';
import SnapshotEntity from '../../main/entity/Snapshot';
import BrowserEntity from '../../main/entity/Browser';
import BrowserTabEntity from '../../main/entity/BrowserTab';
import IDEEntity from '../../main/entity/IDE';
import IDEFileEntity from '../../main/entity/IDEFile';
import ApplicationEntity from '../../main/entity/Application';
import FileEntity from '../../main/entity/File';

function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function faviconFor(tab: BrowserTabEntity): string | null {
  if (tab.favIconUrl && /^https?:\/\//.test(tab.favIconUrl)) {
    return tab.favIconUrl;
  }
  if (tab.url && /^https?:\/\//.test(tab.url)) {
    const host = hostFromUrl(tab.url);
    if (host) {
      return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(
        host
      )}&sz=32`;
    }
  }
  return null;
}

function ArtifactIcon({
  src,
  letter,
}: {
  src?: string | null;
  letter: string;
}) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    return (
      <img
        className={styles.artifactIcon}
        src={src}
        alt=""
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span className={styles.artifactIconFallback}>
      {(letter || '?').slice(0, 1).toUpperCase()}
    </span>
  );
}

type RowProps = {
  icon: React.ReactNode;
  name: string;
  sub?: string | null;
  childCount?: number;
  isOpen?: boolean;
  onToggle?: () => void;
  isChild?: boolean;
};

function ArtifactRow({
  icon,
  name,
  sub,
  childCount,
  isOpen,
  onToggle,
  isChild,
}: RowProps) {
  return (
    <div
      className={`${styles.artifactRow} ${isChild ? styles.artifactChild : ''}`}
    >
      {icon}
      <div className={styles.artifactBody}>
        <div className={styles.artifactName}>{name}</div>
        {sub ? <div className={styles.artifactSub}>{sub}</div> : null}
      </div>
      {childCount && childCount > 0 && onToggle ? (
        <button
          type="button"
          className={`${styles.artifactExpand} ${
            isOpen ? styles.artifactExpandOpen : ''
          }`}
          onClick={onToggle}
          aria-label={isOpen ? 'Hide children' : 'Show children'}
        >
          ▸
        </button>
      ) : null}
    </div>
  );
}

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
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const isSubtask = useMemo(
    () => snapshot?.parentId != null,
    [snapshot]
  );

  const toggleExpanded = (k: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

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

  const browsers = (snapshot.browsers ?? []) as BrowserEntity[];
  const ides = (snapshot.ides ?? []) as IDEEntity[];
  const apps = (snapshot.applications ?? []) as ApplicationEntity[];
  const hasAnyArtifact =
    browsers.length + ides.length + apps.length > 0;

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

        {!hasAnyArtifact && (
          <div className={styles.empty}>No artifacts captured.</div>
        )}

        {browsers.length > 0 && (
          <div className={styles.artifactGroup}>
            <div className={styles.groupName}>Browsers</div>
            {browsers.map((b) => {
              const tabs = (b.browserTabs ?? []) as BrowserTabEntity[];
              const k = `browser-${b.id}`;
              const isOpen = expanded.has(k);
              return (
                <div key={k}>
                  <ArtifactRow
                    icon={
                      <ArtifactIcon
                        src={(b as any).icon || null}
                        letter={String(b.type ?? 'B')}
                      />
                    }
                    name={(b as any).name || String(b.type) || 'Browser'}
                    sub={`${tabs.length} tab${tabs.length === 1 ? '' : 's'}`}
                    childCount={tabs.length}
                    isOpen={isOpen}
                    onToggle={() => toggleExpanded(k)}
                  />
                  {isOpen &&
                    tabs.map((t) => (
                      <ArtifactRow
                        key={`tab-${t.id}`}
                        isChild
                        icon={
                          <ArtifactIcon
                            src={faviconFor(t)}
                            letter={hostFromUrl(t.url || t.title || '?')}
                          />
                        }
                        name={t.title || hostFromUrl(t.url)}
                        sub={hostFromUrl(t.url)}
                      />
                    ))}
                </div>
              );
            })}
          </div>
        )}

        {ides.length > 0 && (
          <div className={styles.artifactGroup}>
            <div className={styles.groupName}>IDEs</div>
            {ides.map((ide) => {
              const files = (ide.ideFiles ?? []) as IDEFileEntity[];
              const k = `ide-${ide.id}`;
              const isOpen = expanded.has(k);
              return (
                <div key={k}>
                  <ArtifactRow
                    icon={
                      <ArtifactIcon
                        src={(ide as any).icon || null}
                        letter={ide.name || 'IDE'}
                      />
                    }
                    name={ide.workspaceName || ide.name || 'IDE'}
                    sub={ide.workspacePath || ide.path}
                    childCount={files.length}
                    isOpen={isOpen}
                    onToggle={() => toggleExpanded(k)}
                  />
                  {isOpen &&
                    files.map((f) => {
                      const display =
                        f.name || (f.path || '').split('/').pop() || f.path;
                      return (
                        <ArtifactRow
                          key={`idefile-${f.id}`}
                          isChild
                          icon={
                            <span className={styles.artifactFileGlyph}>📄</span>
                          }
                          name={display}
                          sub={f.path}
                        />
                      );
                    })}
                </div>
              );
            })}
          </div>
        )}

        {apps.length > 0 && (
          <div className={styles.artifactGroup}>
            <div className={styles.groupName}>Applications</div>
            {apps.map((app) => {
              const files = (app.files ?? []) as FileEntity[];
              const k = `app-${app.id}`;
              const isOpen = expanded.has(k);
              return (
                <div key={k}>
                  <ArtifactRow
                    icon={
                      <ArtifactIcon
                        src={(app as any).icon || null}
                        letter={app.name || 'A'}
                      />
                    }
                    name={app.name || app.title || 'Application'}
                    sub={
                      app.title && app.title !== app.name ? app.title : null
                    }
                    childCount={files.length}
                    isOpen={isOpen}
                    onToggle={() => toggleExpanded(k)}
                  />
                  {isOpen &&
                    files.map((f) => (
                      <ArtifactRow
                        key={`file-${f.id}`}
                        isChild
                        icon={
                          <span className={styles.artifactFileGlyph}>📄</span>
                        }
                        name={f.name || f.path}
                        sub={f.path}
                      />
                    ))}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
