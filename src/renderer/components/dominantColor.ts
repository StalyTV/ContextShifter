/*
 * dominantColor
 * -------------
 * Derives a representative colour from an icon (data URL). Used to tint the
 * trim bar's artefact-introduction markers. Draws the image to a small
 * offscreen canvas, then picks the most prominent *vivid* colour — weighting by
 * saturation so a logo's accent wins over its white/grey padding. Results are
 * cached by source string. Remote URLs taint the canvas, so callers should pass
 * data-URL icons; on any failure we return a neutral fallback.
 */

const FALLBACK = '#8a8a8a';
const cache = new Map<string, string>();
const pending = new Map<string, Promise<string>>();

function computeFromImage(img: HTMLImageElement): string {
  const size = 24;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return FALLBACK;
  ctx.drawImage(img, 0, 0, size, size);
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, size, size).data;
  } catch {
    return FALLBACK; // tainted canvas (e.g. remote image)
  }

  // Bucket colours coarsely and weight each by alpha * (saturation + small base)
  // so vivid pixels dominate but a flat icon still yields its average.
  const buckets = new Map<string, { r: number; g: number; b: number; w: number }>();
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    if (a < 128) continue;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;
    const weight = (a / 255) * (sat + 0.12);
    const key = `${r >> 5}-${g >> 5}-${b >> 5}`;
    const cur = buckets.get(key) ?? { r: 0, g: 0, b: 0, w: 0 };
    cur.r += r * weight;
    cur.g += g * weight;
    cur.b += b * weight;
    cur.w += weight;
    buckets.set(key, cur);
  }

  let best: { r: number; g: number; b: number; w: number } | null = null;
  for (const cur of buckets.values()) {
    if (!best || cur.w > best.w) best = cur;
  }
  if (!best || best.w === 0) return FALLBACK;
  const r = Math.round(best.r / best.w);
  const g = Math.round(best.g / best.w);
  const b = Math.round(best.b / best.w);
  return `rgb(${r}, ${g}, ${b})`;
}

/** Resolve the dominant colour for an icon source, cached. */
export default function dominantColor(src: string | null | undefined): Promise<string> {
  if (!src) return Promise.resolve(FALLBACK);
  const hit = cache.get(src);
  if (hit) return Promise.resolve(hit);
  const inflight = pending.get(src);
  if (inflight) return inflight;

  const p = new Promise<string>((resolve) => {
    const img = new Image();
    img.onload = () => {
      const color = computeFromImage(img);
      cache.set(src, color);
      pending.delete(src);
      resolve(color);
    };
    img.onerror = () => {
      cache.set(src, FALLBACK);
      pending.delete(src);
      resolve(FALLBACK);
    };
    img.src = src;
  });
  pending.set(src, p);
  return p;
}
