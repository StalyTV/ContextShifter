/*
 * anonymize-study-data.mjs
 * -----------------------
 * Post-hoc anonymisation of exported ContextShifter study data.
 *
 * WHY A SEPARATE TOOL
 * -------------------
 * The app's built-in "Anonymize Data" switch destroys `embeddedText`, which is
 * what the semantic layer is reconstructed from. This tool runs AFTER
 * reconstruction instead, so the analysis keeps its content signal (embeddings)
 * while the exported file stops carrying identifying text.
 *
 * IDENTITY MODEL (the key property you asked for)
 * ----------------------------------------------
 * The same real artefact always receives the SAME id, in every record and
 * across every input file processed in one run:
 *
 *   anonId    = H(salt, artefact key)     -> canonical identity: an app path,
 *               a tab URL, an IDE file. This is the app's own notion of "the
 *               same artefact", so a tab revisited in five tasks has one id.
 *   contentId = H(salt, normalised text)  -> identical titles/headers collide
 *               here even when the underlying key differs.
 *
 * Ids are keyed by a random SALT. Without a salt an id is just a hash of a URL,
 * which is trivially reversed by hashing a dictionary of likely URLs. The salt
 * is NOT written into the anonymised output. Pass --salt to reproduce a
 * previous run's ids; otherwise one is generated and printed.
 *
 * WHAT IS REMOVED  (values replaced by stable pseudonyms)
 *   taskName, artefact key/name/path/url/title, embeddedText,
 *   neverClose app names+paths (record level and top level)
 *
 * WHAT IS KEPT (non-identifying, needed for analysis)
 *   every numeric metric, selected, kind, browserType, studyPhase, weights,
 *   scores/similarities/cosines, semanticStatus, embeddings (see risk note),
 *   plus derived shape fields: pathExt, pathDepth, domainId, text word/char
 *   counts.
 *
 * RESIDUAL RISK — stated plainly, not hidden
 *   1. `embedding` vectors are derived from the original text. Embedding
 *      inversion can partially recover short strings. Use --strip-embeddings
 *      if the file leaves your control; keep them for your own analysis.
 *   2. `insitu.comment` is free text a participant typed. It is KEPT by
 *      default because it is qualitative data, and every comment is listed in
 *      the review report for you to read. Use --redact-comments to remove.
 *   3. Timestamps reveal working patterns. --shift-dates offsets them all by
 *      one random per-run delta, preserving every interval.
 *
 * VERIFICATION
 *   After writing, the tool re-scans its own output for distinctive fragments
 *   of the original identifying strings and fails loudly if any survived.
 *
 * USAGE
 *   node scripts/anonymize-study-data.mjs <in.json> [more.json ...]
 *        [--out-dir <dir>] [--suffix .anon] [--salt <hex>]
 *        [--mapping-out <file>]   # reverse map + salt: STORE SEPARATELY
 *        [--review-out <file>]    # free text needing human review
 *        [--strip-embeddings] [--redact-comments] [--shift-dates]
 *
 * Process all participants in ONE invocation so they share a salt and ids stay
 * consistent across files.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { createHash, randomBytes } from 'crypto';
import { join, dirname, basename, extname, resolve } from 'path';

/* ------------------------------ helpers ------------------------------ */

const H = (salt, kind, value) =>
  createHash('sha256').update(`${salt}|${kind}|${value}`).digest('hex').slice(0, 12);

const normText = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Registrable-ish host of a URL, or '' — hashed, never emitted in clear. */
function hostOf(url) {
  try {
    return new URL(String(url)).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** File extension of a path, safe to keep (".xlsx" tells you the kind of doc). */
function extOf(p) {
  const e = extname(String(p ?? ''));
  return /^\.[A-Za-z0-9]{1,8}$/.test(e) ? e.toLowerCase() : '';
}

const depthOf = (p) =>
  String(p ?? '').split(/[\\/]+/).filter(Boolean).length;

/* --------------------------- the anonymiser --------------------------- */

class Anonymizer {
  constructor(salt, opts) {
    this.salt = salt;
    this.opts = opts;
    this.map = new Map();        // pseudonym -> original (for --mapping-out)
    this.secrets = new Set();    // original identifying strings (leak check)
    this.review = [];            // free text a human must vet
    this.dateShiftMs = opts.shiftDates
      ? // deterministic in-run offset: 30-400 days back, whole minutes
        -((parseInt(salt.slice(0, 8), 16) % 370) + 30) * 86400000
      : 0;
  }

  /** Remember an original string so the leak check can hunt for it later. */
  secret(v) {
    const s = String(v ?? '').trim();
    if (s.length >= 4) this.secrets.add(s);
    return s;
  }

  id(kind, value, prefix) {
    const h = H(this.salt, kind, value);
    const pseudo = `${prefix}-${h}`;
    if (!this.map.has(pseudo)) this.map.set(pseudo, { kind, original: value });
    return pseudo;
  }

  shiftDate(iso) {
    if (!this.dateShiftMs || !iso) return iso;
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return iso;
    return new Date(t + this.dateShiftMs).toISOString();
  }

  /** Anonymise one artefact in place. */
  artefact(a) {
    // Canonical identity: prefer the key (app:path / tab:type|url / idef:...),
    // fall back through url/path/name, then any pre-existing anonId.
    const identity =
      a.key || a.url || a.path || a.name || (a.anonId != null ? `anon:${a.anonId}` : '');
    const kind = a.kind || 'artefact';

    this.secret(a.key); this.secret(a.name); this.secret(a.path);
    this.secret(a.url); this.secret(a.title); this.secret(a.embeddedText);

    const anonId = this.id('artefact', identity, 'a');
    const text = normText(a.embeddedText);
    const contentId = text ? this.id('content', text, 'c') : null;

    // Derived shape — useful, non-identifying.
    const pathExt = extOf(a.path);
    const pathDepth = a.path ? depthOf(a.path) : 0;
    const host = hostOf(a.url);
    const domainId = host ? this.id('domain', host, 'd') : null;
    const words = text ? text.split(' ').filter(Boolean).length : 0;
    const chars = String(a.embeddedText ?? '').length;

    a.anonId = anonId;
    a.contentId = contentId;
    a.key = `${kind}:${anonId}`;      // keep the key shape so joins still work
    a.name = `${kind}-${anonId.slice(2)}`;
    a.path = '';
    a.url = '';
    a.title = '';
    a.embeddedText = contentId ? `text-${contentId.slice(2)}` : '';
    a.pathExt = pathExt;
    a.pathDepth = pathDepth;
    a.domainId = domainId;
    a.embeddedTextWords = words;
    a.embeddedTextChars = chars;

    if (this.opts.stripEmbeddings) a.embedding = null;
    if (a.lastAccessTs) a.lastAccessTs = this.shiftDate(a.lastAccessTs);
    return a;
  }

  /** Anonymise a {name, path} app entry (never-close lists). */
  appEntry(e) {
    const identity = e.path || e.name || (e.anonId != null ? `anon:${e.anonId}` : '');
    this.secret(e.name); this.secret(e.path);
    const id = this.id('artefact', identity, 'a');
    return { anonId: id, name: `app-${id.slice(2)}`, path: '', pathExt: extOf(e.path) };
  }

  record(r, fileLabel) {
    this.secret(r.taskName);
    const taskId = this.id('task', String(r.taskName ?? ''), 't');
    r.taskName = taskId;
    r.anonymized = true;

    for (const f of ['recordedAt', 'startedAt', 'stoppedAt']) {
      if (r[f]) r[f] = this.shiftDate(r[f]);
    }

    if (r.neverClose) {
      r.neverClose.apps = (r.neverClose.apps ?? []).map((e) => this.appEntry(e));
      r.neverClose.tabs = (r.neverClose.tabs ?? []).map((t) => {
        this.secret(t.url); this.secret(t.title);
        const id = this.id('artefact', t.url || t.title || '', 'a');
        const host = hostOf(t.url);
        return {
          anonId: id,
          browserType: t.browserType ?? '',
          domainId: host ? this.id('domain', host, 'd') : null,
        };
      });
    }

    if (r.insitu) {
      if (r.insitu.respondedAt) r.insitu.respondedAt = this.shiftDate(r.insitu.respondedAt);
      const c = String(r.insitu.comment ?? '').trim();
      if (c) {
        this.review.push({ file: fileLabel, task: taskId, comment: c });
        if (this.opts.redactComments) {
          r.insitu.comment = '';
          r.insitu.commentRedacted = true;
          r.insitu.commentChars = c.length;
        }
        // else: kept verbatim ON PURPOSE — surfaced in the review report.
      }
    }

    r.artefacts = (r.artefacts ?? []).map((a) => this.artefact(a));
    return r;
  }
}

/* ------------------------------ leak check ---------------------------- */

/*
 * Build the string the leak check scans: ONLY participant-derived content.
 * Tool-authored metadata (this file's own prose, and the reconstruction notes)
 * is English text containing words like "study" and "participant", which would
 * otherwise fire constantly and make the check worthless. Intentionally-kept
 * derived values (pathExt) are dropped too, so a kept ".xlsx" is not reported
 * as a leak of "results.xlsx".
 */
function scannableOf(data) {
  const clone = JSON.parse(JSON.stringify(data));
  delete clone.anonymization;
  delete clone.reconstruction;
  for (const r of clone.records ?? []) {
    delete r.reconstruction;
    for (const a of r.artefacts ?? []) delete a.pathExt;
  }
  // Scan string VALUES only — field names like "studyPhase" contain ordinary
  // words and would otherwise match originals such as "…/Study-Data/…".
  const values = [];
  (function walk(o) {
    if (Array.isArray(o)) { o.forEach(walk); return; }
    if (o && typeof o === 'object') { Object.values(o).forEach(walk); return; }
    if (typeof o === 'string') values.push(o);
  })(clone);
  return values.join('\n');
}

/*
 * Scan the serialised output for distinctive fragments of the originals.
 * Only fragments that are long and not generic are used, so kept-by-design
 * values (browserType "chrome", kind "app", …) don't trip it.
 */
const GENERIC = new Set([
  'app', 'tab', 'file', 'ide', 'chrome', 'firefox', 'safari', 'edge', 'true',
  'false', 'null', 'http', 'https', 'www', 'com', 'org', 'net', 'json', 'text',
  'name', 'path', 'url', 'title', 'users', 'user', 'applications', 'system',
  'library', 'documents', 'desktop', 'downloads', 'contents', 'macos',
  'program', 'files', 'windows', 'appdata', 'local', 'roaming', 'exe',
  'phase1', 'phase2', 'task', 'artefact', 'reconstructed', 'neutral',
]);

function leakCheck(outputJson, secrets) {
  const hay = outputJson.toLowerCase();
  const hits = [];
  for (const s of secrets) {
    for (const frag of String(s).toLowerCase().split(/[^a-z0-9äöüéèàç]+/i)) {
      if (frag.length < 5 || GENERIC.has(frag) || /^\d+$/.test(frag)) continue;
      if (hay.includes(frag)) {
        hits.push({ fragment: frag, from: String(s).slice(0, 80) });
        break;
      }
    }
    if (hits.length > 40) break;
  }
  return hits;
}

/* -------------------------------- main -------------------------------- */

function parseArgs(argv) {
  const o = {
    inputs: [], outDir: null, suffix: '.anon', salt: null,
    mappingOut: null, reviewOut: null,
    stripEmbeddings: false, redactComments: false, shiftDates: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--out-dir') o.outDir = argv[++i];
    else if (a === '--suffix') o.suffix = argv[++i];
    else if (a === '--salt') o.salt = argv[++i];
    else if (a === '--mapping-out') o.mappingOut = argv[++i];
    else if (a === '--review-out') o.reviewOut = argv[++i];
    else if (a === '--strip-embeddings') o.stripEmbeddings = true;
    else if (a === '--redact-comments') o.redactComments = true;
    else if (a === '--shift-dates') o.shiftDates = true;
    else if (a.startsWith('-')) throw new Error(`Unknown option: ${a}`);
    else o.inputs.push(a);
  }
  if (!o.inputs.length) {
    throw new Error(
      'Usage: node scripts/anonymize-study-data.mjs <in.json> [more.json ...] ' +
      '[--out-dir d] [--salt hex] [--mapping-out f] [--review-out f] ' +
      '[--strip-embeddings] [--redact-comments] [--shift-dates]'
    );
  }
  return o;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const salt = opts.salt || randomBytes(24).toString('hex');
  const anon = new Anonymizer(salt, opts);
  const written = [];
  let totalRecords = 0, totalArtefacts = 0;

  for (const input of opts.inputs) {
    const inPath = resolve(input);
    if (!existsSync(inPath)) { console.error(`[anon] SKIP (not found): ${inPath}`); continue; }
    const label = basename(inPath);
    const data = JSON.parse(readFileSync(inPath, 'utf8'));

    for (const e of data.neverCloseApplications ?? []) Object.assign(e, anon.appEntry(e));
    for (const t of data.neverCloseBrowserTabs ?? []) {
      anon.secret(t.url); anon.secret(t.title);
      const id = anon.id('artefact', t.url || t.title || '', 'a');
      Object.assign(t, { anonId: id, url: undefined, title: undefined });
    }

    data.records = (data.records ?? []).map((r) => anon.record(r, label));
    data.anonymized = true;
    totalRecords += data.records.length;
    totalArtefacts += data.records.reduce((s, r) => s + (r.artefacts?.length ?? 0), 0);

    data.anonymization = {
      tool: 'scripts/anonymize-study-data.mjs',
      anonymizedAt: new Date().toISOString(),
      idModel:
        'anonId = H(salt, artefact key) — the same artefact has the same id in ' +
        'every record and across every file processed in this run. ' +
        'contentId = H(salt, normalised embeddedText) — identical titles collide.',
      saltStored: false,
      removed: [
        'taskName', 'artefact.key', 'artefact.name', 'artefact.path',
        'artefact.url', 'artefact.title', 'artefact.embeddedText',
        'neverClose app names/paths', 'neverCloseBrowserTabs url/title',
      ],
      kept: [
        'all numeric metrics', 'selected (ground truth)', 'kind', 'browserType',
        'studyPhase', 'weights', 'scores/similarities/cosines', 'semanticStatus',
        opts.stripEmbeddings ? 'embeddings REMOVED' : 'embedding vectors',
      ],
      derivedAdded: ['anonId', 'contentId', 'pathExt', 'pathDepth', 'domainId',
                     'embeddedTextWords', 'embeddedTextChars'],
      options: {
        stripEmbeddings: opts.stripEmbeddings,
        redactComments: opts.redactComments,
        shiftDates: opts.shiftDates,
      },
      residualRisk: [
        opts.stripEmbeddings
          ? 'Embeddings removed.'
          : 'Embedding vectors are derived from the original text; embedding ' +
            'inversion can partially recover short strings. Use ' +
            '--strip-embeddings before sharing outside your control.',
        opts.redactComments
          ? 'Free-text in-situ comments were redacted.'
          : 'Free-text in-situ comments are KEPT verbatim and must be read by a ' +
            'human before release (see the review report).',
        opts.shiftDates
          ? 'All timestamps shifted by one constant offset; intervals preserved.'
          : 'Timestamps are unshifted and reveal working patterns.',
      ],
    };

    const dir = opts.outDir ? resolve(opts.outDir) : dirname(inPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const ext = extname(inPath) || '.json';
    const outPath = join(dir, `${basename(inPath, ext)}${opts.suffix}${ext}`);
    const serialised = JSON.stringify(data, null, 2);
    writeFileSync(outPath, serialised);
    written.push({ outPath, serialised, scannable: scannableOf(data) });
    console.log(`[anon] ${label} -> ${basename(outPath)}  (${data.records.length} records)`);
  }

  // ---- verification: hunt for surviving fragments of the originals ----
  let leaks = [];
  for (const w of written) leaks = leaks.concat(leakCheck(w.scannable, anon.secrets));

  if (opts.mappingOut) {
    const mp = resolve(opts.mappingOut);
    writeFileSync(mp, JSON.stringify({
      WARNING: 'RE-IDENTIFICATION KEY. Store separately from the anonymised ' +
               'data and never publish. Deleting this file makes the ' +
               'anonymisation irreversible.',
      salt,
      createdAt: new Date().toISOString(),
      pseudonyms: Object.fromEntries(anon.map),
    }, null, 2));
    console.log(`[anon] mapping -> ${basename(mp)}  (KEEP PRIVATE)`);
  }

  if (opts.reviewOut) {
    const rp = resolve(opts.reviewOut);
    writeFileSync(rp, JSON.stringify({
      note: 'Free text typed by participants. Read each one and confirm it ' +
            'names no person, project or organisation before publishing.',
      redactedInOutput: opts.redactComments,
      comments: anon.review,
    }, null, 2));
    console.log(`[anon] review -> ${basename(rp)}  (${anon.review.length} free-text comments)`);
  }

  console.log(`\n[anon] records ${totalRecords} | artefacts ${totalArtefacts} | ` +
              `distinct pseudonyms ${anon.map.size}`);
  console.log(`[anon] salt = ${salt}`);
  console.log(`[anon]   (re-run with --salt ${salt.slice(0, 8)}… to reproduce these ids)`);
  if (anon.review.length && !opts.redactComments) {
    console.log(`[anon] ⚠ ${anon.review.length} free-text comment(s) KEPT — review them before release.`);
  }
  if (leaks.length) {
    console.log(`\n[anon] ✗ LEAK CHECK FAILED — ${leaks.length} original fragment(s) survived:`);
    leaks.slice(0, 15).forEach((h) => console.log(`   "${h.fragment}"  (from: ${h.from})`));
    process.exitCode = 2;
  } else {
    console.log('[anon] ✓ leak check passed — no original identifying fragment found in output');
  }
}

try { main(); } catch (err) {
  console.error(`[anon] FAILED: ${err?.stack || err}`);
  process.exit(1);
}
