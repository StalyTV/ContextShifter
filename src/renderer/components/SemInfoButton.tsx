import { useState } from 'react';
import artefactText from '../../main/scoring/artefactText';

type Kind = 'app' | 'ide' | 'tab' | 'file';

type Props = {
  kind: Kind;
  name?: string | null;
  path?: string | null;
  url?: string | null;
  title?: string | null;
};

/**
 * A small "Sem." button that reveals the exact text (and the fields it came
 * from) used to build this artefact's semantic embedding — computed with the
 * same `artefactText` function the scorer uses, so it's transparent.
 */
export default function SemInfoButton({ kind, name, path, url, title }: Props) {
  const [open, setOpen] = useState(false);
  const text = artefactText({ kind, name, path, url, title });

  const fields: Array<[string, string]> = [];
  if (title) fields.push(['title', title]);
  if (url) fields.push(['url', url]);
  if (path) fields.push(['path', path]);
  if (name) fields.push(['name', name]);

  return (
    <span style={{ position: 'relative', flex: '0 0 auto' }}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        title="Show the text used for the semantic embedding"
        style={{
          fontSize: 10,
          lineHeight: 1,
          padding: '2px 5px',
          borderRadius: 4,
          border: '1px solid rgba(147,112,219,0.5)',
          background: open
            ? 'rgba(147,112,219,0.3)'
            : 'rgba(147,112,219,0.14)',
          color: '#9370db',
          cursor: 'pointer',
        }}
      >
        Sem.
      </button>
      {open && (
        <>
          {/* click-away backdrop */}
          <span
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
            }}
            style={{ position: 'fixed', inset: 0, zIndex: 40 }}
          />
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: 4,
              zIndex: 41,
              width: 300,
              maxWidth: '80vw',
              padding: '8px 10px',
              borderRadius: 6,
              border: '1px solid rgba(147,112,219,0.45)',
              background: 'var(--bg-color-2, #1e1e1e)',
              boxShadow: '0 6px 20px rgba(0,0,0,0.35)',
              fontSize: 11,
              lineHeight: 1.4,
              textAlign: 'left',
              whiteSpace: 'normal',
              wordBreak: 'break-word',
            }}
          >
            <div style={{ color: '#9370db', fontWeight: 600, marginBottom: 4 }}>
              Embedding text
            </div>
            <div
              style={{
                fontFamily: 'ui-monospace, Menlo, monospace',
                background: 'rgba(127,127,127,0.12)',
                padding: '4px 6px',
                borderRadius: 4,
                marginBottom: 6,
              }}
            >
              {text || '(empty — nothing to embed)'}
            </div>
            <div style={{ opacity: 0.75 }}>
              {fields.map(([k, v]) => (
                <div key={k}>
                  <span style={{ opacity: 0.7 }}>{k}:</span> {v}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </span>
  );
}
