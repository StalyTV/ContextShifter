import { useEffect, useMemo, useState } from 'react';
import BrowserEntity from '../../main/entity/Browser';
import BrowserTabEntity from '../../main/entity/BrowserTab';
import IDEEntity from '../../main/entity/IDE';
import IDEFileEntity from '../../main/entity/IDEFile';
import ApplicationEntity from '../../main/entity/Application';
import FileEntity from '../../main/entity/File';
import { StoppedTaskBundle } from '../../types/Commands';
import TrimBar from './TrimBar';
import ConfirmDialog from './ConfirmDialog';
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

// Chrome tab-group colour names -> CSS hex, for the group swatch.
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

// Semantic relevance [0,1], shown next to the score only when semantic scoring
// is active (the value is set in that case, including small values for
// off-topic artefacts). Purple to distinguish it from the relevance score.
function SemBadge({ value }: { value?: number }) {
  if (value == null) return null;
  return (
    <span
      className={styles.score}
      title="Semantic relevance (content similarity to the task)"
      style={{ background: 'rgba(147, 112, 219, 0.22)', color: '#9370db' }}
    >
      S {value.toFixed(2)}
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
  // Timeline trim window (curate the time spent on the task).
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [trimBusy, setTrimBusy] = useState(false);
  // Left edge of the visible timeline: starts at the default pre-roll before
  // activation and extends back (15 min at a time) down to the floor.
  const [visibleStart, setVisibleStart] = useState(0);
  // Whether the "discard this session?" confirmation is showing.
  const [confirmDiscard, setConfirmDiscard] = useState(false);

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
            // Skip the screen: commit the scorer's selection over the default
            // (active) window and finish.
            await commitSelection(result, sel, {
              startMs: result.sessionStartMs,
              endMs: result.sessionEndMs,
            });
            if (!cancelled) {
              setCommitted(true);
              onCommitted();
            }
            return;
          }
          setSelected(sel);
          setExpanded(exp);
          setTrimStart(result.sessionStartMs);
          setTrimEnd(result.sessionEndMs);
          setVisibleStart(
            Math.max(
              result.floorMs,
              result.sessionStartMs - (result.preRollMs ?? 0)
            )
          );
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
  const commitSelection = async (
    b: StoppedTaskBundle,
    sel: Set<Key>,
    trim?: { startMs: number; endMs: number }
  ) => {
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
      applications,
      trim
    );
  };

  // Live drag: just move the brackets (visual only).
  const handleTrimPreview = (s: number, e: number) => {
    setTrimStart(s);
    setTrimEnd(e);
  };

  // On release: re-score the session over the kept window and re-prime the
  // auto-selection so the user sees exactly how the scores change.
  const handleTrimCommit = async (s: number, e: number) => {
    if (!bundle || saving) return;
    setTrimStart(s);
    setTrimEnd(e);
    setTrimBusy(true);
    try {
      const rescored = await window.electron.ipcRenderer.invoke(
        'simulate-trim',
        s,
        e
      );
      if (rescored) {
        setBundle(rescored);
        const { sel } = computeAutoSelection(rescored);
        setSelected(sel);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setTrimBusy(false);
    }
  };

  const handleCommit = async () => {
    if (!bundle || saving) return;
    setSaving(true);
    try {
      // Always send the chosen window: it may extend before activation (into
      // the pre-roll) or trim either end, and the backend records it as the
      // task's boundary for the next task.
      const trim = { startMs: trimStart, endMs: trimEnd };
      await commitSelection(bundle, selected, trim);
      setCommitted(true);
      onCommitted();
    } catch (err) {
      setError(String(err));
      setSaving(false);
    }
  };

  // The Discard/Cancel button. When this would throw away a tracked session,
  // ask for confirmation first; otherwise just close.
  const handleCancel = () => {
    if (saving) return;
    if (discardOnCancel && bundle && !committed) {
      setConfirmDiscard(true);
      return;
    }
    onClose();
  };

  // Actually discard the session (after the user confirms).
  const performDiscard = async () => {
    if (saving) return;
    setConfirmDiscard(false);
    try {
      await window.electron.ipcRenderer.invoke('discard-active-task');
    } catch {
      // best-effort
    }
    onClose();
  };

  // When the selection screen is disabled (or while we're still deciding), the
  // dialog auto-commits in the effect above and renders nothing.
  if (autoMode !== false) return null;

  return (
    <div className={styles.backdrop}>
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

        {bundle && bundle.sessionEndMs > bundle.sessionStartMs && (
          <>
            <TrimBar
              startMs={visibleStart}
              endMs={bundle.sessionEndMs}
              trimStart={trimStart}
              trimEnd={trimEnd}
              activeStartMs={bundle.sessionStartMs}
              lastTaskEndMs={bundle.lastTaskEndMs}
              markers={bundle.markers}
              segments={bundle.segments}
              idlePeriods={bundle.idlePeriods}
              onPreview={handleTrimPreview}
              onCommit={handleTrimCommit}
              busy={trimBusy}
            />
            {visibleStart > bundle.floorMs && (
              <button
                type="button"
                onClick={() =>
                  setVisibleStart((v) =>
                    Math.max(bundle.floorMs, v - 15 * 60 * 1000)
                  )
                }
                title="Reveal 15 more minutes before the task started"
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent)',
                  cursor: 'pointer',
                  fontSize: '12px',
                  padding: '2px 0 8px',
                }}
              >
                ◀ Show 15 min earlier
              </button>
            )}
          </>
        )}

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
                      <SemBadge value={b.semanticRelevance} />
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
                      (() => {
                        const renderTab = (
                          t: BrowserTabEntity,
                          indent: boolean
                        ) => {
                          const tk = keyTab(b, t);
                          const checked = selected.has(tk);
                          const fav = faviconFor(t);
                          return (
                            <div
                              key={tk}
                              className={`${styles.row} ${styles.child} ${
                                parentChecked ? '' : styles.rowOff
                              }`}
                              style={indent ? { paddingLeft: 26 } : undefined}
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
                                  {t.profileEmail ? ` · ${t.profileEmail}` : ''}
                                </div>
                              </div>
                              <ScoreBadge value={t.relevance} />
                              <SemBadge value={t.semanticRelevance} />
                            </div>
                          );
                        };

                        // Partition into tab groups + ungrouped tabs.
                        const grouped = new Map<string, BrowserTabEntity[]>();
                        const ungrouped: BrowserTabEntity[] = [];
                        tabs.forEach((t) => {
                          if (t.groupTitle) {
                            const arr = grouped.get(t.groupTitle) ?? [];
                            arr.push(t);
                            grouped.set(t.groupTitle, arr);
                          } else ungrouped.push(t);
                        });

                        return (
                          <>
                            {Array.from(grouped.entries()).map(
                              ([title, gtabs]) => {
                                const keys = gtabs.map((t) => keyTab(b, t));
                                const allOn = keys.every((kk) =>
                                  selected.has(kk)
                                );
                                return (
                                  <div key={`grp-${title}`}>
                                    <div
                                      className={`${styles.row} ${styles.child} ${
                                        parentChecked ? '' : styles.rowOff
                                      }`}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={allOn}
                                        disabled={!parentChecked}
                                        onChange={() =>
                                          setSelected((prev) => {
                                            const n = new Set(prev);
                                            keys.forEach((kk) =>
                                              allOn ? n.delete(kk) : n.add(kk)
                                            );
                                            return n;
                                          })
                                        }
                                      />
                                      <span
                                        style={{
                                          width: 14,
                                          height: 14,
                                          borderRadius: 4,
                                          flex: '0 0 auto',
                                          background: chromeGroupColor(
                                            gtabs[0].groupColor
                                          ),
                                        }}
                                      />
                                      <div className={styles.body}>
                                        <div className={styles.name}>{title}</div>
                                        <div className={styles.sub}>
                                          tab group · {gtabs.length} tab
                                          {gtabs.length === 1 ? '' : 's'}
                                        </div>
                                      </div>
                                    </div>
                                    {gtabs.map((t) => renderTab(t, true))}
                                  </div>
                                );
                              }
                            )}
                            {ungrouped.map((t) => renderTab(t, false))}
                          </>
                        );
                      })()}
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
                      <SemBadge value={i.semanticRelevance} />
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
                      <SemBadge value={f.semanticRelevance} />
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
                      <SemBadge value={a.semanticRelevance} />
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

      {confirmDiscard && (
        <ConfirmDialog
          title="Discard this session?"
          message="The tracked artefacts for this session won't be saved to the task. This can't be undone."
          confirmLabel="Discard"
          cancelLabel="Keep editing"
          danger
          onConfirm={performDiscard}
          onCancel={() => setConfirmDiscard(false)}
        />
      )}
    </div>
  );
}
