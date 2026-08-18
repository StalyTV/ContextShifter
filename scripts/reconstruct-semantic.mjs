/*
 * reconstruct-semantic.mjs
 * ------------------------
 * Recomputes the semantic relevance of an exported study-data JSON offline.
 *
 * WHY THIS EXISTS
 * ---------------
 * In the packaged releases (v0.4.0–v0.4.3) the embedding model failed to load:
 * `@huggingface/transformers` is ESM-only and was packed inside `app.asar`,
 * which Electron 23's ESM loader cannot import ("ENOTDIR ... app.asar/..."),
 * so `EmbeddingProvider` disabled itself. Every artefact then took the neutral
 * fallback — `semanticSimilarity: 1`, `semanticCosine: null`, `embedding: null`
 * — and because the semantic factor is `(1 - a) + a * 1 = 1`, the recorded
 * `score` is exactly the BEHAVIOURAL score, unmodified.
 *
 * That last point is what makes this reconstruction exact rather than an
 * estimate: the centroid weight the app would have used *is* the recorded
 * `score`, and the text that would have been embedded was saved verbatim as
 * `embeddedText`. So this script reproduces what the app would have computed,
 * using the same model, the same centroid rule, and the same sigmoid.
 *
 * WHAT IT MIRRORS (see src/main/scoring/SemanticScorer.ts + ArtifactScorer.ts)
 *   centroid   = normalize( sum_i w_i * e_i ), w_i = max(0, behavioural score)
 *                (uniform weights if every weight is 0)
 *   cosine     = dot(e_a, centroid)            (both unit length)
 *   similarity = clamp01( sigmoid( (cosine - MIDPOINT) / TEMPERATURE ) )
 *   score      = behavioural * ((1 - INFLUENCE) + INFLUENCE * similarity)
 *
 * KNOWN LIMITATION (documented per record in the output)
 *   The live scorer also excludes artefacts the user had PREVIOUSLY DESELECTED
 *   from the centroid. That set is not part of the export, so it cannot be
 *   reproduced here. Every record reports `priorDeselectedUnknown: true`. For
 *   the common case (first-time or never-deselected tasks) the two agree
 *   exactly; where a participant had deselected artefacts before, the
 *   reconstructed centroid may include a few artefacts the live one would have
 *   dropped.
 *
 * WHAT IT NEVER TOUCHES
 *   `selected` — the participant's own choice, i.e. the ground truth. It is
 *   copied through untouched. Likewise the behavioural inputs (durations,
 *   counts, recency) are never recomputed; only the semantic layer is.
 *
 * USAGE
 *   node scripts/reconstruct-semantic.mjs <input.json> [more.json ...]
 *        [-o <output.json>]        # only valid with a single input
 *        [--out-dir <dir>]         # default: alongside each input
 *        [--suffix <s>]            # default: ".reconstructed"
 *        [--strip-embeddings]      # omit the 384-dim vectors (much smaller)
 *        [--quiet]
 *
 * Run it from the repository root so `@huggingface/transformers` and the
 * bundled model under assets/models/ resolve.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname, basename, extname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

/* ------------------------------------------------------------------ *
 * Scoring constants — must match src/main/StaticSettings.ts.
 * They are verified against that file at startup (warn on drift) so this
 * script can't silently diverge from the app.
 * ------------------------------------------------------------------ */
const CONFIG = {
  MODEL: 'Xenova/all-MiniLM-L6-v2',
  SEMANTIC_MIDPOINT: 0.4,
  SEMANTIC_TEMPERATURE: 0.12,
  SCORE_SEMANTIC_INFLUENCE: 1,
  SCORE_SELECT_THRESHOLD: 0.5,
};

function verifyConstants(quiet) {
  const file = join(REPO_ROOT, 'src', 'main', 'StaticSettings.ts');
  if (!existsSync(file)) return;
  const src = readFileSync(file, 'utf8');
  const read = (name) => {
    const m = src.match(
      new RegExp(`${name}\\s*=\\s*([-\\d.]+(?:\\s*\\*\\s*[-\\d.]+)*)`)
    );
    if (!m) return null;
    // handle simple products like "30 * 60 * 1000"
    return m[1].split('*').reduce((a, b) => a * parseFloat(b), 1);
  };
  const readStr = (name) => {
    const m = src.match(new RegExp(`${name}\\s*=\\s*'([^']+)'`));
    return m ? m[1] : null;
  };
  const checks = [
    ['SEMANTIC_MIDPOINT', read('SEMANTIC_MIDPOINT')],
    ['SEMANTIC_TEMPERATURE', read('SEMANTIC_TEMPERATURE')],
    ['SCORE_SEMANTIC_INFLUENCE', read('SCORE_SEMANTIC_INFLUENCE')],
    ['SCORE_SELECT_THRESHOLD', read('SCORE_SELECT_THRESHOLD')],
    ['SEMANTIC_MODEL', readStr('SEMANTIC_MODEL')],
  ];
  for (const [name, actual] of checks) {
    if (actual == null) continue;
    const expected = name === 'SEMANTIC_MODEL' ? CONFIG.MODEL : CONFIG[name];
    if (actual !== expected) {
      console.warn(
        `[reconstruct] WARNING: ${name} is ${actual} in StaticSettings.ts but ` +
          `${expected} here. Using ${actual} (the app's value).`
      );
      if (name === 'SEMANTIC_MODEL') CONFIG.MODEL = actual;
      else CONFIG[name] = actual;
    }
  }
  if (!quiet) console.log('[reconstruct] constants verified against StaticSettings.ts');
}

/* ------------------------------ math ------------------------------ */

const sigmoid = (x) => 1 / (1 + Math.exp(-x));

/** Map a raw cosine to [0,1] — mirrors SemanticScorer.normalizeCosine. */
function normalizeCosine(cosine) {
  const t =
    CONFIG.SEMANTIC_TEMPERATURE <= 0 ? 1e-6 : CONFIG.SEMANTIC_TEMPERATURE;
  return Math.min(
    1,
    Math.max(0, sigmoid((cosine - CONFIG.SEMANTIC_MIDPOINT) / t))
  );
}

/** Cosine of two unit-length vectors — mirrors EmbeddingProvider.cosine. */
function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i += 1) dot += a[i] * b[i];
  return dot;
}

/** Multiplicative semantic modifier — mirrors ArtifactScorer.semanticFactor. */
function semanticFactor(similarity) {
  const influence = Math.min(1, Math.max(0, CONFIG.SCORE_SEMANTIC_INFLUENCE));
  const s = Math.min(1, Math.max(0, similarity ?? 1));
  return 1 - influence + influence * s;
}

const isFiniteNum = (v) => typeof v === 'number' && Number.isFinite(v);

/* ---------------------------- embedder ---------------------------- */

async function loadExtractor(quiet) {
  const { pipeline, env } = await import('@huggingface/transformers');
  // Same offline setup as EmbeddingProvider: the model ships under assets/models.
  env.allowRemoteModels = false;
  env.localModelPath = join(REPO_ROOT, 'assets', 'models');
  const modelDir = join(env.localModelPath, CONFIG.MODEL);
  if (!existsSync(modelDir)) {
    throw new Error(
      `Model not found at ${modelDir}.\n` +
        `Run \`node scripts/fetch-model.mjs\` first (downloads ~90 MB once).`
    );
  }
  if (!quiet) console.log(`[reconstruct] loading ${CONFIG.MODEL} from ${env.localModelPath}…`);
  const extractor = await pipeline('feature-extraction', CONFIG.MODEL, {
    dtype: 'fp32',
  });
  if (!quiet) console.log('[reconstruct] model ready');
  return extractor;
}

/**
 * Embed texts with a process-wide cache (identical strings recur constantly
 * across records — same tabs, same files). Returns Map<text, number[]>.
 * Batched so a large export doesn't build one enormous tensor.
 */
async function embedAll(extractor, texts, cache, quiet) {
  const missing = [...new Set(texts)].filter((t) => !cache.has(t));
  if (missing.length === 0) return cache;
  const BATCH = 64;
  for (let i = 0; i < missing.length; i += BATCH) {
    const batch = missing.slice(i, i + BATCH);
    try {
      const out = await extractor(batch, { pooling: 'mean', normalize: true });
      const vecs = out.tolist();
      batch.forEach((t, k) => {
        const v = vecs[k];
        // Guard against a malformed row rather than poisoning the centroid.
        if (Array.isArray(v) && v.length > 0 && v.every(isFiniteNum)) {
          cache.set(t, v);
        }
      });
    } catch (err) {
      // Fall back to one-at-a-time so a single pathological string can't lose
      // the whole batch.
      for (const t of batch) {
        try {
          const out = await extractor([t], { pooling: 'mean', normalize: true });
          const v = out.tolist()[0];
          if (Array.isArray(v) && v.length > 0 && v.every(isFiniteNum)) {
            cache.set(t, v);
          }
        } catch {
          /* leave uncached -> treated as un-embeddable (neutral) */
        }
      }
      if (!quiet) {
        console.warn(
          `[reconstruct] batch at ${i} failed, retried individually: ${String(err).slice(0, 120)}`
        );
      }
    }
  }
  return cache;
}

/* -------------------------- reconstruction ------------------------- */

/**
 * Which artefacts may define the task centroid. Mirrors the filter in
 * ActiveTaskSession.scoreStats:
 *   - never-close artefacts are excluded (already absent from the export, but
 *     re-checked defensively against the record's neverClose lists)
 *   - an app that merely HOSTS documents is excluded; its documents carry the
 *     content (detected here as an `app:<path>` having `file:<path>|…` siblings)
 *   - previously-deselected artefacts CANNOT be reproduced (not exported)
 */
function centroidEligibility(record) {
  const artefacts = Array.isArray(record.artefacts) ? record.artefacts : [];

  const neverClosePaths = new Set(
    (record.neverClose?.apps ?? []).map((a) => a?.path).filter(Boolean)
  );
  const neverCloseUrls = new Set(
    (record.neverClose?.tabs ?? []).map((t) => t?.url).filter(Boolean)
  );

  // app path -> does it host documents in this record?
  const hostPaths = new Set();
  for (const a of artefacts) {
    if (a?.kind === 'file' && typeof a.key === 'string' && a.key.startsWith('file:')) {
      hostPaths.add(a.key.slice('file:'.length).split('|')[0]);
    }
  }

  const reasons = new Map();
  for (const a of artefacts) {
    const key = a?.key ?? '';
    let reason = null;
    if (a?.path && neverClosePaths.has(a.path)) reason = 'never-close';
    else if (a?.url && neverCloseUrls.has(a.url)) reason = 'never-close';
    else if (
      a?.kind === 'app' &&
      typeof key === 'string' &&
      key.startsWith('app:') &&
      hostPaths.has(key.slice('app:'.length))
    ) {
      reason = 'document-host-app';
    }
    reasons.set(key, reason);
  }
  return reasons;
}

/**
 * Recompute one record in place on a deep copy. Returns per-record stats.
 */
function reconstructRecord(record, cache, stripEmbeddings) {
  const artefacts = Array.isArray(record.artefacts) ? record.artefacts : [];
  const exclusion = centroidEligibility(record);

  // The recorded `score` IS the behavioural score (semantic factor was 1).
  const behaviouralOf = (a) => (isFiniteNum(a?.score) ? a.score : 0);

  const embOf = (a) => {
    const text = typeof a?.embeddedText === 'string' ? a.embeddedText : '';
    if (!text.trim()) return null;
    return cache.get(text) ?? null;
  };

  // Artefacts that may define the centroid AND actually have a vector.
  const usable = artefacts.filter(
    (a) => !exclusion.get(a?.key ?? '') && embOf(a)
  );

  const stats = {
    artefacts: artefacts.length,
    centroidSize: usable.length,
    reconstructed: 0,
    neutralNoText: 0,
    neutralExcluded: 0,
    neutralInsufficientCorpus: 0,
    priorDeselectedUnknown: true,
  };

  // Mirrors `usable.length < 2` in SemanticScorer: not enough to define a
  // meaningful centroid, so everything stays neutral.
  if (usable.length < 2) {
    for (const a of artefacts) {
      a.behaviouralScore = behaviouralOf(a);
      a.semanticSimilarity = 1;
      a.semanticCosine = null;
      if (!stripEmbeddings) a.embedding = embOf(a) ?? null;
      a.semanticStatus = 'neutral-insufficient-corpus';
      stats.neutralInsufficientCorpus += 1;
      // score unchanged (behavioural * 1)
    }
    record.reconstruction = stats;
    return stats;
  }

  // Behavioural-weighted centroid; uniform if every weight is 0.
  const dim = embOf(usable[0]).length;
  const centroid = new Array(dim).fill(0);
  const totalWeight = usable.reduce(
    (s, a) => s + Math.max(0, behaviouralOf(a)),
    0
  );
  const useUniform = totalWeight <= 0;
  for (const a of usable) {
    const e = embOf(a);
    if (e.length !== dim) continue; // defensive: never mix dimensions
    const w = useUniform ? 1 : Math.max(0, behaviouralOf(a));
    for (let d = 0; d < dim; d += 1) centroid[d] += w * e[d];
  }
  let norm = 0;
  for (let d = 0; d < dim; d += 1) norm += centroid[d] * centroid[d];
  norm = Math.sqrt(norm) || 1;
  for (let d = 0; d < dim; d += 1) centroid[d] /= norm;
  stats.centroidWeighting = useUniform ? 'uniform (all weights 0)' : 'behavioural';

  for (const a of artefacts) {
    const behavioural = behaviouralOf(a);
    a.behaviouralScore = behavioural;

    const e = embOf(a);
    const excluded = exclusion.get(a?.key ?? '');

    if (!e) {
      // No embeddable text: anonymised export, or an artefact with no title/
      // name/url worth embedding. Neutral — exactly what the app does.
      a.semanticSimilarity = 1;
      a.semanticCosine = null;
      if (!stripEmbeddings) a.embedding = null;
      a.semanticStatus = excluded
        ? `neutral-${excluded}`
        : 'neutral-no-text';
      if (excluded) stats.neutralExcluded += 1;
      else stats.neutralNoText += 1;
      continue;
    }

    // NOTE: excluded artefacts do not define the centroid, but they are still
    // SCORED against it — same as the app (the exclusion is centroid-only).
    const cos = cosine(e, centroid);
    const sim = normalizeCosine(cos);
    a.semanticSimilarity = sim;
    a.semanticCosine = cos;
    if (!stripEmbeddings) a.embedding = e;
    a.score = behavioural * semanticFactor(sim);
    a.semanticStatus = excluded
      ? `scored-but-${excluded}`
      : 'reconstructed';
    stats.reconstructed += 1;
    if (excluded) stats.neutralExcluded += 1;
  }

  // What the picker WOULD have preselected with semantic active (threshold
  // relative to the max score). Recorded for analysis only — `selected` (the
  // participant's ground truth) is never modified.
  let max = 0;
  for (const a of artefacts) if (isFiniteNum(a.score) && a.score > max) max = a.score;
  const cutoff = CONFIG.SCORE_SELECT_THRESHOLD * max;
  for (const a of artefacts) {
    a.autoSelectReconstructed =
      max > 0 && isFiniteNum(a.score) ? a.score >= cutoff : false;
  }

  record.reconstruction = stats;
  return stats;
}

/* ------------------------------- main ------------------------------ */

function parseArgs(argv) {
  const opts = {
    inputs: [],
    out: null,
    outDir: null,
    suffix: '.reconstructed',
    stripEmbeddings: false,
    quiet: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '-o' || a === '--out') opts.out = argv[++i];
    else if (a === '--out-dir') opts.outDir = argv[++i];
    else if (a === '--suffix') opts.suffix = argv[++i];
    else if (a === '--strip-embeddings') opts.stripEmbeddings = true;
    else if (a === '--quiet') opts.quiet = true;
    else if (a.startsWith('-')) throw new Error(`Unknown option: ${a}`);
    else opts.inputs.push(a);
  }
  if (opts.inputs.length === 0) {
    throw new Error(
      'Usage: node scripts/reconstruct-semantic.mjs <input.json> [more.json ...] ' +
        '[-o out.json] [--out-dir dir] [--suffix .reconstructed] [--strip-embeddings]'
    );
  }
  if (opts.out && opts.inputs.length > 1) {
    throw new Error('-o cannot be used with multiple inputs; use --out-dir.');
  }
  return opts;
}

function outputPathFor(input, opts) {
  if (opts.out) return resolve(opts.out);
  const dir = opts.outDir ? resolve(opts.outDir) : dirname(resolve(input));
  const ext = extname(input) || '.json';
  const base = basename(input, ext);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, `${base}${opts.suffix}${ext}`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  verifyConstants(opts.quiet);
  const extractor = await loadExtractor(opts.quiet);
  const cache = new Map();

  for (const input of opts.inputs) {
    const inPath = resolve(input);
    if (!existsSync(inPath)) {
      console.error(`[reconstruct] SKIP (not found): ${inPath}`);
      continue;
    }
    const data = JSON.parse(readFileSync(inPath, 'utf8'));
    const records = Array.isArray(data.records) ? data.records : [];

    // Collect every embeddable text up front so the model runs in few batches.
    const texts = [];
    for (const r of records) {
      for (const a of r.artefacts ?? []) {
        const t = typeof a?.embeddedText === 'string' ? a.embeddedText : '';
        if (t.trim()) texts.push(t);
      }
    }
    await embedAll(extractor, texts, cache, opts.quiet);

    const totals = {
      records: records.length,
      artefacts: 0,
      reconstructed: 0,
      neutralNoText: 0,
      neutralInsufficientCorpus: 0,
    };
    for (const r of records) {
      const s = reconstructRecord(r, cache, opts.stripEmbeddings);
      totals.artefacts += s.artefacts;
      totals.reconstructed += s.reconstructed;
      totals.neutralNoText += s.neutralNoText;
      totals.neutralInsufficientCorpus += s.neutralInsufficientCorpus;
    }

    data.reconstruction = {
      tool: 'scripts/reconstruct-semantic.mjs',
      reconstructedAt: new Date().toISOString(),
      reason:
        'Packaged releases v0.4.0-v0.4.3 could not load the ESM embedding model ' +
        'from inside app.asar, so every artefact received the neutral fallback ' +
        '(semanticSimilarity=1, semanticCosine=null, embedding=null) and the ' +
        'recorded score equalled the behavioural score. This file recomputes ' +
        'the semantic layer offline from the saved embeddedText.',
      model: CONFIG.MODEL,
      midpoint: CONFIG.SEMANTIC_MIDPOINT,
      temperature: CONFIG.SEMANTIC_TEMPERATURE,
      influence: CONFIG.SCORE_SEMANTIC_INFLUENCE,
      selectThreshold: CONFIG.SCORE_SELECT_THRESHOLD,
      embeddingsIncluded: !opts.stripEmbeddings,
      notes: [
        '`selected` is the participant ground truth and is unmodified.',
        '`behaviouralScore` preserves the originally recorded score.',
        '`score` is now behavioural * ((1-influence) + influence*similarity).',
        '`autoSelectReconstructed` is what the picker would have preselected; ' +
          'it is analysis-only and did NOT influence the participant.',
        'Previously-deselected artefacts are not in the export, so they could ' +
          'not be excluded from the centroid (see priorDeselectedUnknown).',
      ],
      totals,
    };

    const outPath = outputPathFor(input, opts);
    writeFileSync(outPath, JSON.stringify(data, null, 2));
    if (!opts.quiet) {
      const pct = totals.artefacts
        ? ((totals.reconstructed / totals.artefacts) * 100).toFixed(1)
        : '0.0';
      console.log(
        `[reconstruct] ${basename(inPath)} -> ${basename(outPath)}\n` +
          `    records ${totals.records} | artefacts ${totals.artefacts} | ` +
          `reconstructed ${totals.reconstructed} (${pct}%)\n` +
          `    neutral: no-text ${totals.neutralNoText}, ` +
          `insufficient-corpus ${totals.neutralInsufficientCorpus}`
      );
    }
  }
}

main().catch((err) => {
  console.error(`[reconstruct] FAILED: ${err?.stack || err}`);
  process.exit(1);
});
