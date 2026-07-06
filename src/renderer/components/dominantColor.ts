/*
 * dominantColor
 * -------------
 * Derives a recognisable colour from an icon (data URL) — the colour a person
 * associates with it. Draws the icon to a small offscreen canvas and picks the
 * dominant *vivid* colour, deliberately ignoring near-white / near-black /
 * greyish pixels. That way an icon that is mostly white (e.g. VS Code) yields
 * its accent (blue) rather than white, and a coloured logo (e.g. Twitch) yields
 * its brand colour (purple). Results cached by source string. Remote URLs would
 * taint the canvas, so callers pass data-URL icons; on any failure we return a
 * neutral grey.
 */

const FALLBACK = '#8a8a8a';
const cache = new Map<string, string>();
const pending = new Map<string, Promise<string>>();

type Bucket = { r: number; g: number; b: number; w: number };

function pickColor(data: Uint8ClampedArray): string {
  // Two passes of bucketing: first only strongly-vivid pixels (ignoring the
  // white/grey background), then a looser pass if the icon is nearly greyscale.
  const collect = (satMin: number, lightMax: number): Map<string, Bucket> => {
    const buckets = new Map<string, Bucket>();
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (a < 128) continue;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const light = (max + min) / 2 / 255;
      const sat = max === 0 ? 0 : (max - min) / max;
      // Skip background-ish pixels: near-white, near-black, or washed-out.
      if (light > lightMax || light < 0.06 || sat < satMin) continue;
      const key = `${r >> 4}-${g >> 4}-${b >> 4}`;
      const cur = buckets.get(key) ?? { r: 0, g: 0, b: 0, w: 0 };
      const weight = a / 255;
      cur.r += r * weight;
      cur.g += g * weight;
      cur.b += b * weight;
      cur.w += weight;
      buckets.set(key, cur);
    }
    return buckets;
  };

  let buckets = collect(0.25, 0.92);
  if (buckets.size === 0) buckets = collect(0.12, 0.96); // looser fallback

  let best: Bucket | null = null;
  for (const cur of buckets.values()) {
    if (!best || cur.w > best.w) best = cur;
  }
  if (!best || best.w === 0) return FALLBACK;
  return `rgb(${Math.round(best.r / best.w)}, ${Math.round(
    best.g / best.w
  )}, ${Math.round(best.b / best.w)})`;
}

function computeFromImage(img: HTMLImageElement): string {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return FALLBACK;
  ctx.drawImage(img, 0, 0, size, size);
  try {
    return pickColor(ctx.getImageData(0, 0, size, size).data);
  } catch {
    return FALLBACK; // tainted canvas (e.g. remote image)
  }
}

/** Resolve the dominant colour for an icon source, cached. */
export default function dominantColor(
  src: string | null | undefined
): Promise<string> {
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
