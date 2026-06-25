import { useEffect, useMemo, useState } from 'react';
import BrowserEntity from '../../main/entity/Browser';
import BrowserTabEntity from '../../main/entity/BrowserTab';
import IDEEntity from '../../main/entity/IDE';
import IDEFileEntity from '../../main/entity/IDEFile';
import ApplicationEntity from '../../main/entity/Application';
import FileEntity from '../../main/entity/File';
import { StoppedTaskBundle } from '../../types/Commands';
import styles from './NewTaskDialog.module.scss';

type Props = {
  /**
   * Pre-fetched bundle from the main process. If undefined, the dialog
   * will invoke 'stop-task' itself on mount (used when the renderer opens
   * the dialog directly, e.g. via the active-task "Stop" button).
   */
  bundle?: StoppedTaskBundle | null;
  /** What to do once the user commits or cancels. */
  onClose: () => void;
  onCommitted: () => void;
  /**
   * Called when the user cancels. If true, the active-task buffer is
   * discarded server-side (we never commit anything). When false the
   * caller is responsible for any cleanup.
   */
  discardOnCancel?: boolean;
};

type Key = string;

const keyBrowser = (b: BrowserEntity) => `browser:${b.type}`;
const keyTab = (b: BrowserEntity, t: BrowserTabEntity) =>
  `tab:${b.type}|${t.url}`;
const keyIde = (i: IDEEntity) => `ide:${i.workspacePath || i.path}`;
const keyWorkspace = (i: IDEEntity) => `workspace:${i.workspacePath || i.path}`;
const keyIdeFile = (i: IDEEntity, f: IDEFileEntity) =>
  `idef:${i.workspacePath || i.path}|${f.path}`;
const keyApp = (a: ApplicationEntity) => `app:${a.path}`;
const keyFile = (a: ApplicationEntity, f: FileEntity) =>
  `file:${a.path}|${f.path}`;

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

function Icon({
  src,
  letter,
  className,
}: {
  src?: string | null;
  letter: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    return (
      <img
        className={`${styles.icon} ${className ?? ''}`}
        src={src}
        alt=""
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span className={`${styles.iconFallback} ${className ?? ''}`}>
      {(letter || '?').slice(0, 1).toUpperCase()}
    </span>
  );
}

function ScoreBadge({ value }: { value?: number }) {
  if (value == null || value <= 0) return null;
  return (
    <span className={styles.score} title="Relevance score">
      {value.toFixed(2)}
    </span>
  );
}

export default function CommitTaskDialog({
  bundle: initialBundle,
  onClose,
  onCommitted,
  discardOnCancel = true,
}: Props) {
  const [bundle, setBundle] = useState<StoppedTaskBundle | null>(
    initialBundle ?? null
  );
  const [loading, setLoading] = useState(initialBundle === undefined);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<Key>>(new Set());
  const [expanded, setExpanded] = useState<Set<Key>>(new Set());
  const [committed, setCommitted] = useState(false);
  // undefined = undecided; true = skip the picker and auto-commit; false = show
  // the picker. Driven by the "Artefact Selection" setting.
  const [autoMode, setAutoMode] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Is the artefact-selection screen enabled? If not, we auto-commit.
        let skip = false;
        try {
          const settings = await window.electron.ipcRenderer.invoke(
            'get-settings'
          );
          skip = (settings as { isArtefactSelectionEnabled?: boolean })
            ?.isArtefactSelectionEnabled === false;
        } catch {
          // default to showing the picker
        }
        if (cancelled) return;
        setAutoMode(skip);

        let result: StoppedTaskBundle | null = initialBundle ?? null;
        if (initialBundle === undefined) {
          result = (await window.electron.ipcRenderer.invoke(
            'stop-task'
          )) as StoppedTaskBundle | null;
        }
        if (cancelled) return;
        setBundle(result);

        if (result) {
          const { sel, exp } = computeAutoSelection(result);
          if (skip) {
            // Skip the screen: commit the scorer's selection and finish.
            await commitSelection(result, sel);
            if (!cancelled) {
              setCommitted(true);
              onCommitted();
            }
            return;
          }
          setSelected(sel);
          setExpanded(exp);
        }
      } catch (err) {
        if (!cancelled) setError(String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Compute the scorer's pre-selection (and which parents to expand). Pure.
  const computeAutoSelection = (b: StoppedTaskBundle) => {
    // Pre-check: the artefacts the scorer auto-selected (above threshold).
    const sel = new Set<Key>([...(b.autoSelectKeys ?? [])]);
    // Expand any parent that has selected children so the user sees them.
    const exp = new Set<Key>();
    b.browsers.forEach((br) => {
      if ((br.browserTabs ?? []).some((t) => sel.has(keyTab(br, t)))) {
        exp.add(keyBrowser(br));
      }
    });
    b.ides.forEach((i) => {
      // Seed the "Project Folder" sub-artefact selection from the IDE's
      // workspaceSelected flag (defaults to selected when a folder is known).
      if (i.workspacePath && i.workspaceSelected !== false) {
        sel.add(keyWorkspace(i));
      }
      if (
        sel.has(keyWorkspace(i)) ||
        (i.ideFiles ?? []).some((f) => sel.has(keyIdeFile(i, f)))
      ) {
        exp.add(keyIde(i));
      }
    });
    b.applications.forEach((a) => {
      if ((a.files ?? []).some((f) => sel.has(keyFile(a, f)))) {
        exp.add(keyApp(a));
      }
    });
    return { sel, exp };
  };

  const toggle = (k: Key) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const toggleExpanded = (k: Key) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const totals = useMemo(() => {
    if (!bundle) return { parents: 0, parentsSelected: 0 };
    let parents = 0;
    let parentsSelected = 0;
    bundle.browsers.forEach((b) => {
      parents += 1;
      if (selected.has(keyBrowser(b))) parentsSelected += 1;
    });
    bundle.ides.forEach((i) => {
      parents += 1;
      if (selected.has(keyIde(i))) parentsSelected += 1;
    });
    bundle.applications.forEach((a) => {
      parents += 1;
      if (selected.has(keyApp(a))) parentsSelected += 1;
    });
    return { parents, parentsSelected };
  }, [bundle, selected]);

  // Build the committed payload from a selection set and send it.
  const commitSelection = async (b: StoppedTaskBundle, sel: Set<Key>) => {
    const browsers = b.browsers
      .filter((br) => sel.has(keyBrowser(br)))
      .map((br) => {
        const tabs = (br.browserTabs ?? []).filter((t) =>
          sel.has(keyTab(br, t))
        );
        return { ...br, browserTabs: tabs } as BrowserEntity;
      });
    const ides = b.ides
      .filter((i) => sel.has(keyIde(i)))
      .map((i) => {
        const files = (i.ideFiles ?? []).filter((f) =>
          sel.has(keyIdeFile(i, f))
        );
        return {
          ...i,
          ideFiles: files,
          workspaceSelected: sel.has(keyWorkspace(i)),
        } as IDEEntity;
      });
    const applications = b.applications
      .filter((a) => sel.has(keyApp(a)))
      .map((a) => {
        const files = (a.files ?? []).filter((f) => sel.has(keyFile(a, f)));
        return { ...a, files } as ApplicationEntity;
      });
    await window.electron.ipcRenderer.invoke(
      'commit-task-artefacts',
      b.taskId,
      browsers,
      ides,
      applications
    );
  };

  const handleCommit = async () => {
    if (!bundle || saving) return;
    setSaving(true);
    try {
      await commitSelection(bundle, selected);
      setCommitted(true);
      onCommitted();
    } catch (err) {
      setError(String(err));
      setSaving(false);
    }
  };

  const handleCancel = async () => {
    if (saving) return;
    if (discardOnCancel && bundle && !committed) {
      try {
        await window.electron.ipcRenderer.invoke('discard-active-task');
      } catch {
        // best-effort
      }
    }
    onClose();
  };

  // When the selection screen is disabled (or while we're still deciding), the
  // dialog auto-commits in the effect above and renders nothing.
  if (autoMode !== false) return null;

  return (
    <div
      className={styles.backdrop}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleCancel();
      }}
    >
      <div className={styles.dialog} role="dialog" aria-modal="true">
        <div className={styles.header}>
          <h2 className={styles.title}>
            {bundle
              ? `Save artefacts for "${bundle.taskName}"`
              : 'Save artefacts'}
          </h2>
          <button
            type="button"
            className={styles.close}
            onClick={handleCancel}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className={styles.sectionHeader}>
          <span className={styles.label}>
            Tracked while the task was active
          </span>
          <span className={styles.counter}>
            {loading
              ? '...'
              : `${totals.parentsSelected} / ${totals.parents}`}
          </span>
        </div>

        <div className={styles.list}>
          {loading && (
            <div className={styles.muted}>Reading tracked artefacts...</div>
          )}
          {!loading && bundle && totals.parents === 0 && (
            <div className={styles.muted}>
              No artefacts were tracked. Switch focus to apps, tabs, or files
              while a task is active and they will show up here next time.
            </div>
          )}

          {bundle && bundle.browsers.length > 0 && (
            <div className={styles.group}>
              <div className={styles.groupTitle}>Browsers</div>
              {bundle.browsers.map((b) => {
                const k = keyBrowser(b);
                const tabs = b.browserTabs ?? [];
                const isOpen = expanded.has(k);
                const parentChecked = selected.has(k);
                return (
                  <div key={k} className={styles.entry}>
                    <div
                      className={`${styles.row} ${
                        parentChecked ? '' : styles.rowOff
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={parentChecked}
                        onChange={() => toggle(k)}
                      />
                      <Icon
                        src={b.icon || null}
                        letter={String(b.type ?? 'B')}
                      />
                      <div className={styles.body}>
                        <div className={styles.name}>{b.type}</div>
                        <div className={styles.sub}>
                          {tabs.length} tab{tabs.length === 1 ? '' : 's'}
                        </div>
                      </div>
                      <ScoreBadge value={b.relevance} />
                      {tabs.length > 0 && (
                        <button
                          type="button"
                          className={`${styles.expand} ${
                            isOpen ? styles.expandOpen : ''
                          }`}
                          onClick={() => toggleExpanded(k)}
                          aria-label={isOpen ? 'Hide tabs' : 'Show tabs'}
                        >
                          ▸
                        </button>
                      )}
                    </div>
                    {isOpen &&
                      tabs.map((t) => {
                        const tk = keyTab(b, t);
                        const checked = selected.has(tk);
                        const fav = faviconFor(t);
                        return (
                          <div
                            key={tk}
                            className={`${styles.row} ${styles.child} ${
                              parentChecked ? '' : styles.rowOff
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={!parentChecked}
                              onChange={() => toggle(tk)}
                            />
                            <Icon
                              src={fav}
                              letter={hostFromUrl(t.url || t.title || '?')}
                            />
                            <div className={styles.body}>
                              <div className={styles.name}>
                                {t.title || hostFromUrl(t.url)}
                              </div>
                              <div className={styles.sub}>
                                {hostFromUrl(t.url)}
                              </div>
                            </div>
                            <ScoreBadge value={t.relevance} />
                          </div>
                        );
                      })}
                  </div>
                );
              })}
            </div>
          )}

          {bundle && bundle.ides.length > 0 && (
            <div className={styles.group}>
              <div className={styles.groupTitle}>IDEs</div>
              {bundle.ides.map((i) => {
                const k = keyIde(i);
                const files = i.ideFiles ?? [];
                const isOpen = expanded.has(k);
                const parentChecked = selected.has(k);
                return (
                  <div key={k} className={styles.entry}>
                    <div
                      className={`${styles.row} ${
                        parentChecked ? '' : styles.rowOff
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={parentChecked}
                        onChange={() => toggle(k)}
                      />
                      <Icon src={i.icon || null} letter={i.name} />
                      <div className={styles.body}>
                        <div className={styles.name}>
                          {i.workspaceName || i.name}
                        </div>
                        <div className={styles.sub}>
                          {i.workspacePath || i.path}
                        </div>
                      </div>
                      <ScoreBadge value={i.relevance} />
                      {(files.length > 0 || i.workspacePath) && (
                        <button
                          type="button"
                          className={`${styles.expand} ${
                            isOpen ? styles.expandOpen : ''
                          }`}
                          onClick={() => toggleExpanded(k)}
                          aria-label={isOpen ? 'Hide contents' : 'Show contents'}
                        >
                          ▸
                        </button>
                      )}
                    </div>
                    {isOpen && (
                      <>
                        {i.workspacePath && (
                          <div
                            className={`${styles.row} ${styles.child} ${
                              parentChecked ? '' : styles.rowOff
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={selected.has(keyWorkspace(i))}
                              disabled={!parentChecked}
                              onChange={() => toggle(keyWorkspace(i))}
                            />
                            <span className={styles.fileGlyph}>📁</span>
                            <div className={styles.body}>
                              <div className={styles.name}>Project Folder</div>
                              <div className={styles.sub}>
                                {i.workspaceName || i.workspacePath}
                              </div>
                            </div>
                          </div>
                        )}
                        {files.map((f) => {
                          const fk = keyIdeFile(i, f);
                          const checked = selected.has(fk);
                          const display =
                            (f as any).name ?? (f.path || '').split('/').pop();
                          return (
                            <div
                              key={fk}
                              className={`${styles.row} ${styles.child} ${
                                parentChecked ? '' : styles.rowOff
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={!parentChecked}
                                onChange={() => toggle(fk)}
                              />
                              <span className={styles.fileGlyph}>📄</span>
                              <div className={styles.body}>
                                <div className={styles.name}>{display}</div>
                                <div className={styles.sub}>{f.path}</div>
                              </div>
                              <ScoreBadge value={f.relevance} />
                            </div>
                          );
                        })}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {bundle && bundle.applications.length > 0 && (
            <div className={styles.group}>
              <div className={styles.groupTitle}>Applications</div>
              {bundle.applications.map((a) => {
                const k = keyApp(a);
                const files = a.files ?? [];
                const isOpen = expanded.has(k);
                const parentChecked = selected.has(k);
                return (
                  <div key={k} className={styles.entry}>
                    <div
                      className={`${styles.row} ${
                        parentChecked ? '' : styles.rowOff
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={parentChecked}
                        onChange={() => toggle(k)}
                      />
                      <Icon src={a.icon || null} letter={a.name} />
                      <div className={styles.body}>
                        <div className={styles.name}>{a.name}</div>
                        {a.title && a.title !== a.name && (
                          <div className={styles.sub}>{a.title}</div>
                        )}
                      </div>
                      <ScoreBadge value={a.relevance} />
                      {files.length > 0 && (
                        <button
                          type="button"
                          className={`${styles.expand} ${
                            isOpen ? styles.expandOpen : ''
                          }`}
                          onClick={() => toggleExpanded(k)}
                          aria-label={isOpen ? 'Hide files' : 'Show files'}
                        >
                          ▸
                        </button>
                      )}
                    </div>
                    {isOpen &&
                      files.map((f) => {
                        const fk = keyFile(a, f);
                        const checked = selected.has(fk);
                        return (
                          <div
                            key={fk}
                            className={`${styles.row} ${styles.child} ${
                              parentChecked ? '' : styles.rowOff
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={!parentChecked}
                              onChange={() => toggle(fk)}
                            />
                            <span className={styles.fileGlyph}>📄</span>
                            <div className={styles.body}>
                              <div className={styles.name}>{f.name}</div>
                              <div className={styles.sub}>{f.path}</div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.footer}>
          <button
            type="button"
            className={styles.secondary}
            onClick={handleCancel}
            disabled={saving}
          >
            {discardOnCancel ? 'Discard' : 'Cancel'}
          </button>
          <button
            type="button"
            className={styles.primary}
            onClick={handleCommit}
            disabled={saving || loading || !bundle}
          >
            {saving ? 'Saving...' : 'Save artefacts'}
          </button>
        </div>
      </div>
    </div>
  );
}
