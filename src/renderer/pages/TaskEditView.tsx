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
import TaskActionButtons from '../components/TaskActionButtons';
import ConfirmDialog from '../components/ConfirmDialog';
import SemInfoButton from '../components/SemInfoButton';
import CommitTaskDialog from '../components/CommitTaskDialog';
import StartTaskDialog from '../components/StartTaskDialog';

type ActiveTask = { id: number; name: string } | null;

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

const CHROME_GROUP_COLORS: Record<string, string> = {
  grey: '#5f6368',
  blue: '#1a73e8',
  red: '#d93025',
  yellow: '#f9ab00',
  green: '#188038',
  pink: '#d01884',
  purple: '#a142f4',
  cyan: '#007b83',
  orange: '#fa903e',
};
const chromeGroupColor = (c?: string) =>
  CHROME_GROUP_COLORS[(c ?? '').toLowerCase()] ?? '#8a8a8a';

type RowProps = {
  icon: React.ReactNode;
  name: string;
  sub?: string | null;
  childCount?: number;
  isOpen?: boolean;
  onToggle?: () => void;
  isChild?: boolean;
  onRemove?: () => void;
  swatch?: string;
  extra?: React.ReactNode;
};

function ArtifactRow({
  icon,
  name,
  sub,
  childCount,
  isOpen,
  onToggle,
  isChild,
  onRemove,
  swatch,
  extra,
}: RowProps) {
  return (
    <div
      className={`${styles.artifactRow} ${isChild ? styles.artifactChild : ''}`}
    >
      {swatch ? (
        <span
          style={{
            width: 14,
            height: 14,
            borderRadius: 4,
            flex: '0 0 auto',
            background: swatch,
          }}
        />
      ) : (
        icon
      )}
      <div className={styles.artifactBody}>
        <div className={styles.artifactName}>{name}</div>
        {sub ? <div className={styles.artifactSub}>{sub}</div> : null}
      </div>
      {extra}
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
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${name}`}
          title="Remove from task"
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-secondary, #999)',
            cursor: 'pointer',
            fontSize: 16,
            lineHeight: 1,
            padding: '0 4px',
            flex: '0 0 auto',
          }}
        >
          ×
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
  const [activeTask, setActiveTask] = useState<ActiveTask>(null);
  const [deleteTarget, setDeleteTarget] = useState<SnapshotEntity | null>(null);
  const [showCommitTask, setShowCommitTask] = useState(false);
  const [showStartTask, setShowStartTask] = useState(false);
  const [startTaskParentId, setStartTaskParentId] = useState<number | null>(
    null
  );
  // What to do after the current task's commit picker is confirmed.
  const [pendingAction, setPendingAction] = useState<
    | { kind: 'none' }
    | { kind: 'resume'; taskId: number }
    | { kind: 'start'; parentId: number; name: string }
    // From the menu-bar / widget / physical button: open the name dialog after
    // committing (no name yet, unlike inline subtask creation).
    | { kind: 'startDialog'; parentId: number | null }
  >({ kind: 'none' });

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
      // Expand the Browser + IDE groups by default so all artefacts are listed.
      const open = new Set<string>();
      (snap.browsers ?? []).forEach((b) => open.add(`browser-${b.id}`));
      (snap.ides ?? []).forEach((i) => open.add(`ide-${i.id}`));
      setExpanded(open);

      const kids: SnapshotEntity[] = await window.electron.ipcRenderer
        .invoke('get-snapshot-children', snap.id);
      setChildren(kids ?? []);
    }
    setLoading(false);
  }

  const removeArtefact = async (
    kind: 'browser' | 'tab' | 'ide' | 'ideFile' | 'app' | 'file',
    artefactId: number
  ) => {
    try {
      await window.electron.ipcRenderer.invoke(
        'remove-task-artefact',
        id,
        kind,
        artefactId
      );
      await load();
    } catch {
      // best-effort
    }
  };

  useEffect(() => {
    if (Number.isFinite(id)) {
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const t = (await window.electron.ipcRenderer.invoke(
        'get-active-task'
      )) as ActiveTask;
      if (alive) setActiveTask(t);
    })();
    const handler = (_e: unknown, task: ActiveTask) => setActiveTask(task);
    (window as any).electron.onActiveTaskChanged(handler);
    return () => {
      alive = false;
      (window as any).electron.removeOnActiveTaskChanged();
    };
  }, []);

  // The menu-bar icon, the switcher widget, and the physical button stop/switch
  // tasks from the main process — which sends this event regardless of which
  // view is open. Handle it here too so stopping works while viewing a task.
  useEffect(() => {
    const onOpen = (
      _e: unknown,
      action:
        | { kind: 'none' }
        | { kind: 'start'; parentId: number | null }
        | { kind: 'resume'; taskId: number }
    ) => {
      if (action?.kind === 'resume') {
        setPendingAction({ kind: 'resume', taskId: action.taskId });
      } else if (action?.kind === 'start') {
        setPendingAction({ kind: 'startDialog', parentId: action.parentId });
      } else {
        setPendingAction({ kind: 'none' });
      }
      setShowCommitTask(true);
    };
    (window as any).electron.onOpenCommitTaskDialog(onOpen);
    return () => (window as any).electron.removeOnOpenCommitTaskDialog();
  }, []);

  // Activate a task/subtask. If another task is active, commit it first.
  const handleActivate = async (taskId: number) => {
    if (activeTask?.id === taskId) return;
    if (activeTask) {
      setPendingAction({ kind: 'resume', taskId });
      setShowCommitTask(true);
      return;
    }
    try {
      await window.electron.ipcRenderer.invoke('resume-task', taskId);
      navigate(`/task/${taskId}`);
    } catch {
      /* best-effort */
    }
  };

  // Pause (deactivate) the active task -> commit picker -> None.
  const handleStop = () => {
    setPendingAction({ kind: 'none' });
    setShowCommitTask(true);
  };

  const finaliseAction = async () => {
    const action = pendingAction;
    setPendingAction({ kind: 'none' });
    try {
      if (action.kind === 'resume') {
        await window.electron.ipcRenderer.invoke('resume-task', action.taskId);
        navigate(`/task/${action.taskId}`);
      } else if (action.kind === 'start') {
        const snap = await window.electron.ipcRenderer.invoke(
          'start-task',
          action.name,
          action.parentId
        );
        if (snap && typeof (snap as any).id === 'number') {
          navigate(`/task/${(snap as any).id}`);
        }
      } else if (action.kind === 'startDialog') {
        // Open the name dialog to start a new task (menu-bar / widget / button).
        setStartTaskParentId(action.parentId);
        setShowStartTask(true);
      } else {
        await load();
      }
    } catch {
      /* best-effort */
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const delId = deleteTarget.id;
    const isCurrent = snapshot != null && delId === snapshot.id;
    setDeleteTarget(null);
    try {
      await window.electron.ipcRenderer.invoke('delete-snapshot', delId);
    } finally {
      if (isCurrent) {
        if (isSubtask && snapshot?.parentId != null) {
          navigate(`/task/${snapshot.parentId}`);
        } else {
          navigate('/');
        }
      } else {
        await load();
      }
    }
  };

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
    setNewName('');
    setShowAdd(false);
    const parentId = snapshot.id;
    // Creating a subtask STARTS it (makes it active) like a normal task. If
    // another task is active, commit it first via the picker, then start.
    if (activeTask) {
      setPendingAction({ kind: 'start', parentId, name: trimmed });
      setShowCommitTask(true);
      return;
    }
    try {
      const snap = await window.electron.ipcRenderer.invoke(
        'start-task',
        trimmed,
        parentId
      );
      if (snap && typeof (snap as any).id === 'number') {
        navigate(`/task/${(snap as any).id}`);
      } else {
        await load();
      }
    } catch {
      /* best-effort */
    }
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
        <div style={{ marginLeft: 'auto' }}>
          <TaskActionButtons
            isActive={activeTask?.id === snapshot.id}
            onActivate={() => handleActivate(snapshot.id)}
            onStop={handleStop}
            onDelete={() => setDeleteTarget(snapshot)}
          />
        </div>
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
                <TaskActionButtons
                  isActive={activeTask?.id === c.id}
                  onActivate={() => handleActivate(c.id)}
                  onStop={handleStop}
                  onDelete={() => setDeleteTarget(c)}
                />
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
                    onRemove={() => removeArtefact('browser', b.id)}
                  />
                  {isOpen &&
                    (() => {
                      const renderTab = (t: BrowserTabEntity) => (
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
                          onRemove={() => removeArtefact('tab', t.id)}
                          extra={
                            <SemInfoButton kind="tab" title={t.title} url={t.url} />
                          }
                        />
                      );
                      const grouped = new Map<string, BrowserTabEntity[]>();
                      const ungrouped: BrowserTabEntity[] = [];
                      tabs.forEach((t) => {
                        const gt = (t as any).groupTitle as string | undefined;
                        if (gt) {
                          const arr = grouped.get(gt) ?? [];
                          arr.push(t);
                          grouped.set(gt, arr);
                        } else ungrouped.push(t);
                      });
                      return (
                        <>
                          {Array.from(grouped.entries()).map(([title, gt]) => (
                            <div key={`grp-${title}`}>
                              <ArtifactRow
                                isChild
                                icon={null}
                                swatch={chromeGroupColor(
                                  (gt[0] as any).groupColor
                                )}
                                name={title}
                                sub={`tab group · ${gt.length} tab${
                                  gt.length === 1 ? '' : 's'
                                }`}
                              />
                              {gt.map(renderTab)}
                            </div>
                          ))}
                          {ungrouped.map(renderTab)}
                        </>
                      );
                    })()}
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
                    childCount={files.length + (ide.workspacePath ? 1 : 0)}
                    isOpen={isOpen}
                    onToggle={() => toggleExpanded(k)}
                    onRemove={() => removeArtefact('ide', ide.id)}
                    extra={
                      <SemInfoButton
                        kind="ide"
                        name={ide.name}
                        path={ide.path}
                        title={(ide as any).title}
                      />
                    }
                  />
                  {isOpen && ide.workspacePath && (
                    <ArtifactRow
                      isChild
                      icon={<span className={styles.artifactFileGlyph}>📁</span>}
                      name={`Project Folder${
                        ide.workspaceSelected === false ? ' (not selected)' : ''
                      }`}
                      sub={ide.workspaceName || ide.workspacePath}
                    />
                  )}
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
                          onRemove={() => removeArtefact('ideFile', f.id)}
                          extra={<SemInfoButton kind="file" path={f.path} />}
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
                    onRemove={() => removeArtefact('app', app.id)}
                    extra={
                      <SemInfoButton
                        kind="app"
                        name={app.name}
                        path={app.path}
                        title={app.title}
                      />
                    }
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
                        onRemove={() => removeArtefact('file', f.id)}
                        extra={<SemInfoButton kind="file" path={f.path} />}
                      />
                    ))}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {showCommitTask && (
        <CommitTaskDialog
          onClose={async () => {
            setShowCommitTask(false);
            await finaliseAction();
          }}
          onCommitted={async () => {
            setShowCommitTask(false);
            await finaliseAction();
          }}
        />
      )}

      {showStartTask && (
        <StartTaskDialog
          onClose={() => setShowStartTask(false)}
          onStarted={() => {
            setShowStartTask(false);
            load();
          }}
          parentId={startTaskParentId}
          parentName={
            startTaskParentId !== null && startTaskParentId === snapshot?.id
              ? snapshot?.name ?? null
              : null
          }
        />
      )}

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
