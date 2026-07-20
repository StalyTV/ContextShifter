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
import SemInfoButton from './SemInfoButton';
import InSituSurvey, { InSituResponse } from './InSituSurvey';
import { ScoreVisibilityProvider, useScoresVisible } from './ScoreVisibility';
import {
  OrderMode,
  ORDER_MODES,
  num,
  maxOf,
  byRelevanceDesc,
} from './artefactOrder';
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
  const visible = useScoresVisible();
  if (!visible || value == null || value <= 0) return null;
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
  const visible = useScoresVisible();
  if (!visible || value == null) return null;
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
  // Whether to show relevance/semantic scores in the picker ("Show relevance
  // scores" setting; off by default).
  const [showScores, setShowScores] = useState(false);
  // Whether the scorer preselects artefacts (Study Phase 2). Phase 1 = no
  // preselection. Defaults to false (Phase 1 is the app default).
  const [preselect, setPreselect] = useState(false);
  // How the artefact list is ordered (see artefactOrder). Default keeps
  // applications grouped and ordered by their most relevant artefact.
  const [orderMode, setOrderMode] = useState<OrderMode>('grouped');
  // Phase-2 in-situ survey shown right after a successful save.
  const [showInSitu, setShowInSitu] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Is the artefact-selection screen enabled? If not, we auto-commit.
        let skip = false;
        // Study Phase 2 preselects; Phase 1 (default) does not.
        let preselectNow = false;
        try {
          const settings = await window.electron.ipcRenderer.invoke(
            'get-settings'
          );
          skip =
            (settings as { isArtefactSelectionEnabled?: boolean })
              ?.isArtefactSelectionEnabled === false;
          if (!cancelled) {
            setShowScores(
              (settings as { showRelevanceScores?: boolean })
                ?.showRelevanceScores === true
            );
          }
          preselectNow =
            (settings as { studyPhase?: string })?.studyPhase === 'phase2';
          if (!cancelled) setPreselect(preselectNow);
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
          if (skip) {
            // Skip the screen: commit the scorer's selection over the default
            // (active) window and finish. (Skipping the picker always trusts
            // the scorer, regardless of study phase.)
            const { sel } = computeAutoSelection(result, true);
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
          const { sel, exp } = computeAutoSelection(result, preselectNow);
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

  // Compute the picker's initial selection (and which parents to expand). Pure.
  // In Phase 1 (`preselect = false`) nothing is pre-checked — the user decides
  // fully — but the browser/IDE groups are still expanded so everything is
  // visible to pick. In Phase 2 the scorer's above-threshold artefacts are
  // pre-checked.
  const computeAutoSelection = (b: StoppedTaskBundle, preselect: boolean) => {
    const sel = new Set<Key>(preselect ? [...(b.autoSelectKeys ?? [])] : []);
    const exp = new Set<Key>();
    b.browsers.forEach((br) => {
      if (
        !preselect ||
        (br.browserTabs ?? []).some((t) => sel.has(keyTab(br, t)))
      ) {
        exp.add(keyBrowser(br));
      }
    });
    b.ides.forEach((i) => {
      // Seed the "Project Folder" sub-artefact selection from the IDE's
      // workspaceSelected flag (defaults to selected when a folder is known).
      if (preselect && i.workspacePath && i.workspaceSelected !== false) {
        sel.add(keyWorkspace(i));
      }
      if (
        !preselect ||
        sel.has(keyWorkspace(i)) ||
        (i.ideFiles ?? []).some((f) => sel.has(keyIdeFile(i, f)))
      ) {
        exp.add(keyIde(i));
      }
    });
    b.applications.forEach((a) => {
      const files = a.files ?? [];
      if (
        (!preselect && files.length > 0) ||
        files.some((f) => sel.has(keyFile(a, f)))
      ) {
        exp.add(keyApp(a));
      }
    });
    return { sel, exp };
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

  // Flat "Relevance" ordering: every artefact as a leaf, remembering its parent
  // application so the parent stays selected on restore. Score 0 leaves (mostly
  // barely-touched browser tabs) are filtered out at render time.
  type FlatLeaf = {
    key: Key;
    parentKey: Key;
    score: number;
    semantic?: number;
    name: string;
    app: string;
    appIconSrc?: string | null;
    appIconLetter?: string;
    iconSrc?: string | null;
    iconLetter?: string;
    glyph?: string;
    sem: {
      kind: 'app' | 'ide' | 'tab' | 'file';
      name?: string | null;
      path?: string | null;
      url?: string | null;
      title?: string | null;
    };
  };
  const flat = useMemo(() => {
    const leaves: FlatLeaf[] = [];
    const parentLeafKeys = new Map<string, Key[]>();
    const add = (l: FlatLeaf) => {
      leaves.push(l);
      if (l.parentKey !== l.key) {
        const arr = parentLeafKeys.get(l.parentKey) ?? [];
        arr.push(l.key);
        parentLeafKeys.set(l.parentKey, arr);
      }
    };
    if (bundle) {
      bundle.browsers.forEach((b) => {
        const pk = keyBrowser(b);
        (b.browserTabs ?? []).forEach((t) =>
          add({
            key: keyTab(b, t),
            parentKey: pk,
            score: num(t.relevance),
            semantic: t.semanticRelevance,
            name: t.title || hostFromUrl(t.url),
            app: String(b.type),
            appIconSrc: b.icon || null,
            appIconLetter: String(b.type ?? 'B'),
            iconSrc: faviconFor(t),
            iconLetter: hostFromUrl(t.url || t.title || '?'),
            sem: { kind: 'tab', title: t.title, url: t.url },
          })
        );
      });
      bundle.ides.forEach((i) => {
        const pk = keyIde(i);
        const files = i.ideFiles ?? [];
        if (files.length === 0) {
          add({
            key: pk,
            parentKey: pk,
            score: num(i.relevance),
            semantic: i.semanticRelevance,
            name: i.workspaceName || i.name,
            app: i.name,
            appIconSrc: i.icon || null,
            appIconLetter: i.name,
            iconSrc: i.icon || null,
            iconLetter: i.name,
            sem: { kind: 'ide', name: i.name, path: i.path, title: i.title },
          });
        } else {
          files.forEach((f) =>
            add({
              key: keyIdeFile(i, f),
              parentKey: pk,
              score: num(f.relevance),
              semantic: f.semanticRelevance,
              name:
                (f as { name?: string }).name ??
                (f.path || '').split('/').pop() ??
                f.path,
              app: i.name,
              appIconSrc: i.icon || null,
              appIconLetter: i.name,
              glyph: '📄',
              sem: { kind: 'file', path: f.path },
            })
          );
        }
      });
      bundle.applications.forEach((a) => {
        const pk = keyApp(a);
        const files = a.files ?? [];
        if (files.length === 0) {
          add({
            key: pk,
            parentKey: pk,
            score: num(a.relevance),
            semantic: a.semanticRelevance,
            name: a.name,
            app: a.name,
            appIconSrc: a.icon || null,
            appIconLetter: a.name,
            iconSrc: a.icon || null,
            iconLetter: a.name,
            sem: { kind: 'app', name: a.name, path: a.path, title: a.title },
          });
        } else {
          files.forEach((f) =>
            add({
              key: keyFile(a, f),
              parentKey: pk,
              score: num(f.relevance),
              semantic: f.semanticRelevance,
              name: f.name,
              app: a.name,
              appIconSrc: a.icon || null,
              appIconLetter: a.name,
              glyph: '📄',
              sem: { kind: 'file', path: f.path },
            })
          );
        }
      });
    }
    leaves.sort((x, y) => y.score - x.score);
    return { leaves, parentLeafKeys };
  }, [bundle]);

  // Toggle a leaf in flat mode, keeping its parent application selected while it
  // has any selected child (so restoration reopens the app/browser).
  const toggleLeaf = (leafKey: Key, parentKey: Key) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(leafKey)) {
        next.delete(leafKey);
        if (parentKey !== leafKey) {
          const siblings = flat.parentLeafKeys.get(parentKey) ?? [];
          if (!siblings.some((sk) => sk !== leafKey && next.has(sk)))
            next.delete(parentKey);
        }
      } else {
        next.add(leafKey);
        if (parentKey !== leafKey) next.add(parentKey);
      }
      return next;
    });
  };

  // Toggle a grouped child (tab / file). Selecting it also selects its parent
  // application; deselecting the last selected child drops the parent, so an
  // artefact can be picked without first checking its application.
  const toggleChild = (childKey: Key, parentKey: Key, siblingKeys: Key[]) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(childKey)) {
        next.delete(childKey);
        if (!siblingKeys.some((sk) => sk !== childKey && next.has(sk)))
          next.delete(parentKey);
      } else {
        next.add(childKey);
        next.add(parentKey);
      }
      return next;
    });
  };

  // Select / deselect a set of child keys at once (a tab group or a browser
  // profile section), keeping the parent application in sync.
  const toggleGroup = (
    groupKeys: Key[],
    parentKey: Key,
    siblingKeys: Key[]
  ) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const allOn = groupKeys.every((k) => next.has(k));
      if (allOn) {
        groupKeys.forEach((k) => next.delete(k));
        if (!siblingKeys.some((sk) => next.has(sk))) next.delete(parentKey);
      } else {
        groupKeys.forEach((k) => next.add(k));
        next.add(parentKey);
      }
      return next;
    });
  };

  // Toggle an application / IDE parent together with its children (documents,
  // files, workspace). Ticking an app thus also keeps its open documents, so
  // restoration reopens the file — not just the application.
  const toggleParent = (parentKey: Key, childKeys: Key[]) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(parentKey)) {
        next.delete(parentKey);
        childKeys.forEach((k) => next.delete(k));
      } else {
        next.add(parentKey);
        childKeys.forEach((k) => next.add(k));
      }
      return next;
    });
  };

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
        const { sel } = computeAutoSelection(rescored, preselect);
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
      // Phase 2, and only for tasks that were actually resumed (their artefacts
      // were restored) — a brand-new task has nothing to have "brought back".
      if (preselect && bundle.wasRestored) {
        setShowInSitu(true);
      } else {
        onCommitted();
      }
    } catch (err) {
      setError(String(err));
      setSaving(false);
    }
  };

  // Persist the in-situ survey answer against the just-saved task, then finish.
  const finishInSitu = async (resp: InSituResponse) => {
    if (bundle) {
      try {
        await window.electron.ipcRenderer.invoke(
          'record-insitu',
          bundle.taskId,
          resp
        );
      } catch {
        // best-effort; never block finishing on the survey
      }
    }
    setShowInSitu(false);
    onCommitted();
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

  // Relevance ordering is a Phase 2 (assisted) feature. In Phase 1 (baseline)
  // artefacts are shown in their natural order with no ordering toggle, so the
  // participant isn't nudged by the scores.
  const orderingEnabled = preselect;
  const listMode: OrderMode = orderingEnabled ? orderMode : 'grouped';

  return (
    <ScoreVisibilityProvider value={showScores}>
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
            <TrimBar
              startMs={visibleStart}
              endMs={bundle.sessionEndMs}
              trimStart={trimStart}
              trimEnd={trimEnd}
              activeStartMs={bundle.sessionStartMs}
              lastTaskEndMs={bundle.lastTaskEndMs}
              canExtend={visibleStart > bundle.floorMs}
              onExtendEarlier={() =>
                setVisibleStart((v) =>
                  Math.max(bundle.floorMs, v - 15 * 60 * 1000)
                )
              }
              markers={bundle.markers}
              segments={bundle.segments}
              idlePeriods={bundle.idlePeriods}
              onPreview={handleTrimPreview}
              onCommit={handleTrimCommit}
              busy={trimBusy}
            />
          )}

          <div className={styles.sectionHeader}>
            <span className={styles.label}>
              Tracked while the task was active
            </span>
            <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {orderingEnabled &&
                ORDER_MODES.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setOrderMode(m.value)}
                    title={
                      m.value === 'grouped'
                        ? 'Group by application, ordered by relevance'
                        : 'Order all artefacts by relevance'
                    }
                    style={{
                      fontSize: 11,
                      padding: '2px 8px',
                      borderRadius: 4,
                      cursor: 'pointer',
                      border: '1px solid rgba(128,128,128,0.4)',
                      background:
                        orderMode === m.value
                          ? 'rgba(46,90,136,0.18)'
                          : 'transparent',
                      color: 'inherit',
                      fontWeight: orderMode === m.value ? 600 : 400,
                    }}
                  >
                    {m.label}
                  </button>
                ))}
              <span className={styles.counter}>
                {loading
                  ? '...'
                  : `${totals.parentsSelected} / ${totals.parents}`}
              </span>
            </span>
          </div>

          <div
            className={styles.list}
            style={{ display: 'flex', flexDirection: 'column' }}
          >
            {loading && (
              <div className={styles.muted}>Reading tracked artefacts...</div>
            )}
            {!loading && bundle && totals.parents === 0 && (
              <div className={styles.muted}>
                No artefacts were tracked. Switch focus to apps, tabs, or files
                while a task is active and they will show up here next time.
              </div>
            )}

            {bundle && listMode === 'grouped' && (
              <>
                {bundle.browsers.map((b) => {
                  const bk = keyBrowser(b);
                  const allTabs = b.browserTabs ?? [];
                  const allTabKeys = allTabs.map((t) => keyTab(b, t));
                  const tabs = orderingEnabled
                    ? [...allTabs]
                        .filter((t) => num(t.relevance) > 0)
                        .sort(byRelevanceDesc((t) => num(t.relevance)))
                    : allTabs;
                  const visibleTabKeys = tabs.map((t) => keyTab(b, t));
                  const score = maxOf(
                    b.relevance,
                    ...allTabs.map((t) => num(t.relevance))
                  );
                  if (orderingEnabled && score <= 0) return null;
                  const isOpen = expanded.has(bk);
                  const parentChecked = selected.has(bk);

                  const renderTab = (t: BrowserTabEntity, indent: boolean) => {
                    const tk = keyTab(b, t);
                    const checked = selected.has(tk);
                    const fav = faviconFor(t);
                    return (
                      <div
                        key={tk}
                        className={`${styles.row} ${styles.child}`}
                        style={indent ? { paddingLeft: 26 } : undefined}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleChild(tk, bk, allTabKeys)}
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
                        <SemInfoButton kind="tab" title={t.title} url={t.url} />
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
                    <div
                      key={bk}
                      className={styles.entry}
                      style={
                        orderingEnabled
                          ? { order: Math.round(-score * 1000) }
                          : undefined
                      }
                    >
                      <div
                        className={`${styles.row} ${
                          parentChecked ? '' : styles.rowOff
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={parentChecked}
                          onChange={() => toggleParent(bk, visibleTabKeys)}
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
                            onClick={() => toggleExpanded(bk)}
                            aria-label={isOpen ? 'Hide tabs' : 'Show tabs'}
                          >
                            ▸
                          </button>
                        )}
                      </div>
                      {isOpen && (
                        <>
                          {Array.from(grouped.entries()).map(
                            ([title, gtabs]) => {
                              const gkeys = gtabs.map((t) => keyTab(b, t));
                              const gAllOn = gkeys.every((kk) =>
                                selected.has(kk)
                              );
                              return (
                                <div key={`grp-${title}`}>
                                  <div
                                    className={`${styles.row} ${styles.child}`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={gAllOn}
                                      onChange={() =>
                                        toggleGroup(gkeys, bk, allTabKeys)
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
                      )}
                    </div>
                  );
                })}
                {bundle.ides.map((i) => {
                  const k = keyIde(i);
                  const files = orderingEnabled
                    ? [...(i.ideFiles ?? [])]
                        .filter((f) => num(f.relevance) > 0)
                        .sort(byRelevanceDesc((f) => num(f.relevance)))
                    : i.ideFiles ?? [];
                  const score = maxOf(
                    i.relevance,
                    ...(i.ideFiles ?? []).map((f) => num(f.relevance))
                  );
                  if (orderingEnabled && score <= 0) return null;
                  const isOpen = expanded.has(k);
                  const parentChecked = selected.has(k);
                  const ideChildKeys = [
                    ...(i.workspacePath ? [keyWorkspace(i)] : []),
                    ...files.map((f) => keyIdeFile(i, f)),
                  ];
                  return (
                    <div
                      key={k}
                      className={styles.entry}
                      style={
                        orderingEnabled
                          ? { order: Math.round(-score * 1000) }
                          : undefined
                      }
                    >
                      <div
                        className={`${styles.row} ${
                          parentChecked ? '' : styles.rowOff
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={parentChecked}
                          onChange={() => toggleParent(k, ideChildKeys)}
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
                        <SemInfoButton
                          kind="ide"
                          name={i.name}
                          path={i.path}
                          title={i.title}
                        />
                        {(files.length > 0 || i.workspacePath) && (
                          <button
                            type="button"
                            className={`${styles.expand} ${
                              isOpen ? styles.expandOpen : ''
                            }`}
                            onClick={() => toggleExpanded(k)}
                            aria-label={
                              isOpen ? 'Hide contents' : 'Show contents'
                            }
                          >
                            ▸
                          </button>
                        )}
                      </div>
                      {isOpen && (
                        <>
                          {i.workspacePath && (
                            <div className={`${styles.row} ${styles.child}`}>
                              <input
                                type="checkbox"
                                checked={selected.has(keyWorkspace(i))}
                                onChange={() =>
                                  toggleChild(keyWorkspace(i), k, ideChildKeys)
                                }
                              />
                              <span className={styles.fileGlyph}>📁</span>
                              <div className={styles.body}>
                                <div className={styles.name}>
                                  Project Folder
                                </div>
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
                              (f as any).name ??
                              (f.path || '').split('/').pop();
                            return (
                              <div
                                key={fk}
                                className={`${styles.row} ${styles.child}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() =>
                                    toggleChild(fk, k, ideChildKeys)
                                  }
                                />
                                <span className={styles.fileGlyph}>📄</span>
                                <div className={styles.body}>
                                  <div className={styles.name}>{display}</div>
                                  <div className={styles.sub}>{f.path}</div>
                                </div>
                                <ScoreBadge value={f.relevance} />
                                <SemBadge value={f.semanticRelevance} />
                                <SemInfoButton kind="file" path={f.path} />
                              </div>
                            );
                          })}
                        </>
                      )}
                    </div>
                  );
                })}
                {bundle.applications.map((a) => {
                  const k = keyApp(a);
                  const files = orderingEnabled
                    ? [...(a.files ?? [])]
                        .filter((f) => num(f.relevance) > 0)
                        .sort(byRelevanceDesc((f) => num(f.relevance)))
                    : a.files ?? [];
                  const score = maxOf(
                    a.relevance,
                    ...(a.files ?? []).map((f) => num(f.relevance))
                  );
                  if (orderingEnabled && score <= 0) return null;
                  const isOpen = expanded.has(k);
                  const parentChecked = selected.has(k);
                  const appChildKeys = files.map((f) => keyFile(a, f));
                  // A file-handler app (Preview/Word/…) can't be picked on its
                  // own — only through its documents. Standalone apps stay
                  // directly selectable.
                  const hasDocuments = (a.files ?? []).length > 0;
                  return (
                    <div
                      key={k}
                      className={styles.entry}
                      style={
                        orderingEnabled
                          ? { order: Math.round(-score * 1000) }
                          : undefined
                      }
                    >
                      <div
                        className={`${styles.row} ${
                          parentChecked ? '' : styles.rowOff
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={parentChecked}
                          disabled={hasDocuments}
                          title={
                            hasDocuments
                              ? 'Select the document(s) below; the app follows automatically'
                              : undefined
                          }
                          onChange={() => toggleParent(k, appChildKeys)}
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
                        <SemInfoButton
                          kind="app"
                          name={a.name}
                          path={a.path}
                          title={a.title}
                        />
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
                              className={`${styles.row} ${styles.child}`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() =>
                                  toggleChild(fk, k, appChildKeys)
                                }
                              />
                              <span className={styles.fileGlyph}>📄</span>
                              <div className={styles.body}>
                                <div className={styles.name}>{f.name}</div>
                                <div className={styles.sub}>{f.path}</div>
                              </div>
                              <ScoreBadge value={f.relevance} />
                              <SemBadge value={f.semanticRelevance} />
                              <SemInfoButton kind="file" path={f.path} />
                            </div>
                          );
                        })}
                    </div>
                  );
                })}
              </>
            )}

            {bundle &&
              listMode === 'flat' &&
              flat.leaves
                .filter((l) => l.score > 0)
                .map((l) => {
                  const checked = selected.has(l.key);
                  return (
                    <div
                      key={l.key}
                      className={`${styles.row} ${
                        checked ? '' : styles.rowOff
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleLeaf(l.key, l.parentKey)}
                      />
                      {l.glyph ? (
                        <span className={styles.fileGlyph}>{l.glyph}</span>
                      ) : (
                        <Icon
                          src={l.iconSrc ?? null}
                          letter={l.iconLetter ?? '?'}
                        />
                      )}
                      <div className={styles.body}>
                        <div className={styles.name}>{l.name}</div>
                        <div
                          className={styles.sub}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          in
                          {l.appIconSrc ? (
                            <img
                              src={l.appIconSrc}
                              alt=""
                              style={{
                                width: 14,
                                height: 14,
                                borderRadius: 3,
                                objectFit: 'contain',
                              }}
                            />
                          ) : null}
                          {l.app}
                        </div>
                      </div>
                      <ScoreBadge value={l.score} />
                      <SemBadge value={l.semantic} />
                      <SemInfoButton
                        kind={l.sem.kind}
                        name={l.sem.name}
                        path={l.sem.path}
                        url={l.sem.url}
                        title={l.sem.title}
                      />
                    </div>
                  );
                })}
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
      {showInSitu && bundle && (
        <InSituSurvey taskName={bundle.taskName} onDone={finishInSitu} />
      )}
    </ScoreVisibilityProvider>
  );
}
