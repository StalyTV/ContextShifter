import { useEffect, useMemo, useState } from 'react';
import BrowserEntity from '../../main/entity/Browser';
import BrowserTabEntity from '../../main/entity/BrowserTab';
import IDEEntity from '../../main/entity/IDE';
import IDEFileEntity from '../../main/entity/IDEFile';
import ApplicationEntity from '../../main/entity/Application';
import FileEntity from '../../main/entity/File';
import styles from './NewTaskDialog.module.scss';

type OpenSets = {
  browsers: BrowserEntity[];
  ides: IDEEntity[];
  applications: ApplicationEntity[];
};

type Props = {
  onClose: () => void;
  onCreated: () => void;
  /** When set, the dialog creates a subtask under this parent. */
  parentId?: number | null;
  /** Optional name shown in the header next to "under". */
  parentName?: string | null;
};

// Selection is tracked per-parent ("browser:1") and per-child ("tab:42").
// Children can only be considered when their parent is selected; toggling a
// parent off implicitly drops its children from the persisted set.
type Key = string;

const browserKey = (b: BrowserEntity) => `browser:${b.windowId ?? b.type}`;
const tabKey = (b: BrowserEntity, t: BrowserTabEntity, i: number) =>
  `tab:${browserKey(b)}:${i}:${t.url}`;
const ideKey = (i: IDEEntity) => `ide:${i.workspacePath ?? i.path}:${i.name}`;
const ideFileKey = (i: IDEEntity, f: IDEFileEntity, n: number) =>
  `idef:${ideKey(i)}:${n}:${f.path}`;
const appKey = (a: ApplicationEntity) => `app:${a.path}:${a.title}`;
const fileKey = (a: ApplicationEntity, f: FileEntity, n: number) =>
  `file:${appKey(a)}:${n}:${f.path}`;

function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * Resolve a favicon URL for a tab. The browser extension supplies
 * `favIconUrl` directly when available; for tabs without one we fall back to
 * Google's public favicon service keyed on the tab's domain. The service is
 * already used for cached favicons elsewhere on the web; failures degrade to
 * the letter fallback rendered when the <img> errors.
 */
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

export default function NewTaskDialog({
  onClose,
  onCreated,
  parentId = null,
  parentName = null,
}: Props) {
  const isSubtask = parentId !== null;
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<OpenSets>({
    browsers: [],
    ides: [],
    applications: [],
  });
  const [selected, setSelected] = useState<Set<Key>>(new Set());
  const [expanded, setExpanded] = useState<Set<Key>>(new Set());

  useEffect(() => {
    let cancelled = false;
    // Hard ceiling so the dialog never hangs forever if the main process
    // takes too long (e.g. lsof stalls). Surface an error the user can act on.
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      setError(
        'Took too long to read open windows. Close the dialog and try again.'
      );
      setLoading(false);
    }, 12000);
    (async () => {
      try {
        // eslint-disable-next-line no-console
        console.log('[NewTaskDialog] invoking get-currently-open-applications');
        const result = await window.electron.ipcRenderer.invoke(
          'get-currently-open-applications'
        );
        // eslint-disable-next-line no-console
        console.log('[NewTaskDialog] got open windows', result);
        if (cancelled) return;
        const [browsers, ides, applications] = result as [
          BrowserEntity[],
          IDEEntity[],
          ApplicationEntity[]
        ];
        setOpen({ browsers, ides, applications });
        // Pre-select every parent and child by default.
        const sel = new Set<Key>();
        browsers.forEach((b) => {
          sel.add(browserKey(b));
          (b.browserTabs ?? []).forEach((t, i) => sel.add(tabKey(b, t, i)));
        });
        ides.forEach((i) => {
          sel.add(ideKey(i));
          (i.ideFiles ?? []).forEach((f, n) => sel.add(ideFileKey(i, f, n)));
        });
        applications.forEach((a) => {
          sel.add(appKey(a));
          (a.files ?? []).forEach((f, n) => sel.add(fileKey(a, f, n)));
        });
        setSelected(sel);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[NewTaskDialog] failed to load open windows', err);
        if (!cancelled) setError(String(err));
      } finally {
        window.clearTimeout(timer);
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

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
    let parents = 0;
    let parentsSelected = 0;
    open.browsers.forEach((b) => {
      parents += 1;
      if (selected.has(browserKey(b))) parentsSelected += 1;
    });
    open.ides.forEach((i) => {
      parents += 1;
      if (selected.has(ideKey(i))) parentsSelected += 1;
    });
    open.applications.forEach((a) => {
      parents += 1;
      if (selected.has(appKey(a))) parentsSelected += 1;
    });
    return { parents, parentsSelected };
  }, [open, selected]);

  const handleCreate = async () => {
    if (saving) return;
    setSaving(true);
    try {
      // Materialize the chosen parents with their selected children only.
      const browsers = open.browsers
        .filter((b) => selected.has(browserKey(b)))
        .map((b) => {
          const tabs = (b.browserTabs ?? []).filter((t, i) =>
            selected.has(tabKey(b, t, i))
          );
          return { ...b, browserTabs: tabs } as BrowserEntity;
        });
      const ides = open.ides
        .filter((i) => selected.has(ideKey(i)))
        .map((i) => {
          const files = (i.ideFiles ?? []).filter((f, n) =>
            selected.has(ideFileKey(i, f, n))
          );
          return { ...i, ideFiles: files } as IDEEntity;
        });
      const applications = open.applications
        .filter((a) => selected.has(appKey(a)))
        .map((a) => {
          const files = (a.files ?? []).filter((f, n) =>
            selected.has(fileKey(a, f, n))
          );
          return { ...a, files } as ApplicationEntity;
        });
      await window.electron.ipcRenderer.invoke(
        'create-task',
        name,
        browsers,
        ides,
        applications,
        parentId
      );
      onCreated();
    } catch (err) {
      setError(String(err));
      setSaving(false);
    }
  };

  return (
    <div
      className={styles.backdrop}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.dialog} role="dialog" aria-modal="true">
        <div className={styles.header}>
          <h2 className={styles.title}>
            {isSubtask
              ? `New subtask${parentName ? ` — under ${parentName}` : ''}`
              : 'New task'}
          </h2>
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <label className={styles.field}>
          <span className={styles.label}>Name</span>
          <input
            className={styles.input}
            type="text"
            placeholder={isSubtask ? 'Subtask name' : 'Task name'}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </label>

        <div className={styles.sectionHeader}>
          <span className={styles.label}>Include open artifacts</span>
          <span className={styles.counter}>
            {loading
              ? '...'
              : `${totals.parentsSelected} / ${totals.parents}`}
          </span>
        </div>

        <div className={styles.list}>
          {loading && (
            <div className={styles.muted}>Reading open windows...</div>
          )}
          {!loading && totals.parents === 0 && (
            <div className={styles.muted}>No tracked windows are open.</div>
          )}

          {open.browsers.length > 0 && (
            <div className={styles.group}>
              <div className={styles.groupTitle}>Browsers</div>
              {open.browsers.map((b) => {
                const k = browserKey(b);
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
                      tabs.map((t, i) => {
                        const tk = tabKey(b, t, i);
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
                          </div>
                        );
                      })}
                  </div>
                );
              })}
            </div>
          )}

          {open.ides.length > 0 && (
            <div className={styles.group}>
              <div className={styles.groupTitle}>IDEs</div>
              {open.ides.map((i) => {
                const k = ideKey(i);
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
                      files.map((f, n) => {
                        const fk = ideFileKey(i, f, n);
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
                          </div>
                        );
                      })}
                  </div>
                );
              })}
            </div>
          )}

          {open.applications.length > 0 && (
            <div className={styles.group}>
              <div className={styles.groupTitle}>Applications</div>
              {open.applications.map((a) => {
                const k = appKey(a);
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
                      files.map((f, n) => {
                        const fk = fileKey(a, f, n);
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
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            className={styles.primary}
            onClick={handleCreate}
            disabled={saving || loading}
          >
            {saving
              ? 'Creating...'
              : isSubtask
              ? 'Create subtask'
              : 'Create task'}
          </button>
        </div>
      </div>
    </div>
  );
}
