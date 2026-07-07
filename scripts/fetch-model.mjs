/*
 * Downloads the local sentence-embedding model into assets/models so it can be
 * bundled into the packaged app (offline semantic relevance). Run automatically
 * before `npm run package`; also run manually (`node scripts/fetch-model.mjs`)
 * to enable semantic scoring in dev. The model is gitignored (it's ~90 MB), so
 * this fetches it on demand and is a no-op once present.
 */
import { mkdir, writeFile, stat } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';
const OUT_DIR = join(ROOT, 'assets', 'models', MODEL_ID);
const BASE = `https://huggingface.co/${MODEL_ID}/resolve/main`;
const FILES = [
  'config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'onnx/model.onnx',
];

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const marker = join(OUT_DIR, 'onnx', 'model.onnx');
  if (await exists(marker)) {
    console.log('[fetch-model] model already present — skipping');
    return;
  }
  console.log(`[fetch-model] downloading ${MODEL_ID} (~90 MB)…`);
  for (const file of FILES) {
    const dest = join(OUT_DIR, file);
    await mkdir(dirname(dest), { recursive: true });
    const res = await fetch(`${BASE}/${file}`);
    if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    await writeFile(dest, buf);
    console.log(`[fetch-model]  ${file} (${buf.length} bytes)`);
  }
  console.log('[fetch-model] done');
}

main().catch((err) => {
  console.error('[fetch-model] failed:', err.message);
  process.exit(1);
});
