/*
 * Generates the macOS tray icon as a template image: a black rounded square
 * with the ContextShifter dial knocked out (transparent) inside it. Run with:
 *   npx electron scripts/gen-tray-icon.js
 * Uses an offscreen canvas (anti-aliased) and the existing dial PNG's alpha as
 * the knockout stencil, so the dial shape stays identical to the app icon.
 */
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const MAC_DIR = path.join(__dirname, '..', 'assets', 'trayIcons', 'mac');
const DIAL = path.join(MAC_DIR, 'ContextShifterTray@2x.png');
// 1x / 1.5x / 2x — matches the camera template icon sizing.
const SIZES = [
  { suffix: '@1x', size: 16 },
  { suffix: '@1.5x', size: 24 },
  { suffix: '@2x', size: 32 },
];

app.whenReady().then(async () => {
  const dialDataUrl = `data:image/png;base64,${fs.readFileSync(DIAL).toString(
    'base64'
  )}`;

  const win = new BrowserWindow({
    show: false,
    width: 64,
    height: 64,
    webPreferences: { offscreen: true },
  });
  await win.loadURL('data:text/html,<body></body>');

  const script = `
    (async () => {
      const dialUrl = ${JSON.stringify(dialDataUrl)};
      const sizes = ${JSON.stringify(SIZES)};
      function roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
      }
      const img = await new Promise((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = rej;
        i.src = dialUrl;
      });
      const out = {};
      for (const { suffix, size } of sizes) {
        const c = document.createElement('canvas');
        c.width = size; c.height = size;
        const ctx = c.getContext('2d');
        // Rounded square, full template colour (black), small padding.
        const pad = Math.max(1, Math.round(size * 0.06));
        const r = Math.round(size * 0.24);
        ctx.fillStyle = '#000';
        roundRect(ctx, pad, pad, size - 2 * pad, size - 2 * pad, r);
        ctx.fill();
        // Knock out the dial (use its alpha to erase), inset inside the square.
        const ds = Math.round(size * 0.60);
        const off = Math.round((size - ds) / 2);
        ctx.globalCompositeOperation = 'destination-out';
        ctx.drawImage(img, off, off, ds, ds);
        ctx.globalCompositeOperation = 'source-over';
        out[suffix] = c.toDataURL('image/png');
      }
      return out;
    })()
  `;
  const out = await win.webContents.executeJavaScript(script, true);
  for (const { suffix } of SIZES) {
    const b64 = out[suffix].replace(/^data:image\/png;base64,/, '');
    const file = path.join(MAC_DIR, `ContextShifterTrayTemplate${suffix}.png`);
    fs.writeFileSync(file, Buffer.from(b64, 'base64'));
    // eslint-disable-next-line no-console
    console.log('wrote', file);
  }
  win.destroy();
  app.quit();
});
