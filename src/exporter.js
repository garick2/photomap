import runtimeSource from './export-runtime.js?raw';

const PREVIEW_MAX = 1200;
const PREVIEW_QUALITY = 0.8;
const THUMB_INNER = 60;
const THUMB_FRAME = 3;
const THUMB_SIZE = THUMB_INNER + THUMB_FRAME * 2;
const THUMB_RADIUS = 4;
const THUMB_PIXEL_RATIO = 2;

async function decodeIfHeic(file) {
  if (!/\.(heic|heif)$/i.test(file.name)) return file;
  const { decodeHeic } = await import('./heic.js');
  return await decodeHeic(file);
}

async function makePreviewDataUrl(file) {
  const source = await decodeIfHeic(file);
  const full = await createImageBitmap(source, { imageOrientation: 'from-image' });
  try {
    const scale = Math.min(1, PREVIEW_MAX / Math.max(full.width, full.height));
    const w = Math.max(1, Math.round(full.width * scale));
    const h = Math.max(1, Math.round(full.height * scale));
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(full, 0, 0, w, h);
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: PREVIEW_QUALITY });
    return await blobToDataUrl(blob);
  } finally {
    full.close();
  }
}

async function makeThumbDataUrl(file) {
  const source = await decodeIfHeic(file);
  const full = await createImageBitmap(source, { imageOrientation: 'from-image' });
  try {
    const w = full.width;
    const h = full.height;
    const s = Math.min(w, h);
    const sx = (w - s) / 2;
    const sy = (h - s) / 2;
    const dim = THUMB_SIZE * THUMB_PIXEL_RATIO;
    const canvas = new OffscreenCanvas(dim, dim);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, 0, 0, dim, dim, THUMB_RADIUS * THUMB_PIXEL_RATIO);
    ctx.fill();
    ctx.save();
    roundRect(
      ctx,
      THUMB_FRAME * THUMB_PIXEL_RATIO,
      THUMB_FRAME * THUMB_PIXEL_RATIO,
      THUMB_INNER * THUMB_PIXEL_RATIO,
      THUMB_INNER * THUMB_PIXEL_RATIO,
      (THUMB_RADIUS - 1) * THUMB_PIXEL_RATIO
    );
    ctx.clip();
    ctx.drawImage(
      full,
      sx, sy, s, s,
      THUMB_FRAME * THUMB_PIXEL_RATIO,
      THUMB_FRAME * THUMB_PIXEL_RATIO,
      THUMB_INNER * THUMB_PIXEL_RATIO,
      THUMB_INNER * THUMB_PIXEL_RATIO
    );
    ctx.restore();
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
    return await blobToDataUrl(blob);
  } finally {
    full.close();
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function blobToDataUrl(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onloadend = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
}

export async function exportMap(photos, { title, onProgress, signal } = {}) {
  const total = photos.length;
  const results = [];
  let done = 0;

  const CONCURRENCY = 3;
  const queue = photos.slice();

  async function worker() {
    while (queue.length) {
      if (signal?.aborted) throw new Error('aborted');
      const p = queue.shift();
      try {
        const file = p.file || (await p.fileHandle.getFile());
        const [thumb, preview] = await Promise.all([
          makeThumbDataUrl(file),
          makePreviewDataUrl(file)
        ]);
        results.push({
          id: p.id,
          name: p.name,
          date: p.date ? new Date(p.date).toISOString() : null,
          lat: p.lat,
          lng: p.lng,
          thumb,
          preview
        });
      } catch (err) {
        console.warn('export skip', p.name, err?.message || err);
      }
      done++;
      onProgress?.({ done, total });
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const html = buildHtml(title || 'PhotoMap', results);
  return { html, count: results.length };
}

export async function saveHtml(html, defaultName) {
  const blob = new Blob([html], { type: 'text/html' });
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: defaultName,
        types: [{ description: 'HTML Document', accept: { 'text/html': ['.html'] } }]
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return { saved: true, method: 'picker' };
    } catch (e) {
      if (e.name === 'AbortError') return { saved: false, aborted: true };
      console.warn('picker failed, falling back', e);
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = defaultName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { saved: true, method: 'download' };
}

function buildHtml(title, photos) {
  const escaped = escapeHtml(title);
  const dataJson = JSON.stringify(photos);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escaped}</title>
<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css">
<style>
*, *::before, *::after { box-sizing: border-box; }
html, body, #app { height: 100%; margin: 0; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: #111; color: #eee;
}
#app { display: flex; flex-direction: column; }
#topbar {
  display: flex; align-items: center; gap: 14px;
  padding: 10px 14px;
  background: #1a1a1a;
  border-bottom: 1px solid #2a2a2a;
  flex-wrap: wrap;
}
#title { font-weight: 600; }
#count { font-size: 13px; color: #bbb; }
.toggle {
  margin-left: auto;
  display: inline-flex; align-items: center; gap: 8px;
  font-size: 13px; color: #ddd; cursor: pointer; user-select: none;
}
.toggle input {
  appearance: none; width: 34px; height: 20px;
  background: #444; border-radius: 10px;
  position: relative; transition: background 0.15s; cursor: pointer; margin: 0;
  flex-shrink: 0;
}
.toggle input::after {
  content: ''; position: absolute; top: 2px; left: 2px;
  width: 16px; height: 16px; background: #fff; border-radius: 50%;
  transition: transform 0.15s;
}
.toggle input:checked { background: #4a90e2; }
.toggle input:checked::after { transform: translateX(14px); }
#map { flex: 1; min-height: 0; }
#viewer {
  position: fixed; inset: 0; background: rgba(0,0,0,0.92);
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  z-index: 1000;
}
#viewer[hidden] { display: none; }
#viewer-stage {
  position: relative; display: flex; align-items: center; justify-content: center;
  max-width: 96vw; max-height: 88vh;
}
#viewer-img {
  max-width: 96vw; max-height: 88vh; object-fit: contain;
  box-shadow: 0 8px 40px rgba(0,0,0,0.6); border-radius: 4px; background: #000;
}
#viewer-img:not([src]) { display: none; }
#viewer-close, #viewer-fullscreen {
  position: absolute; top: 16px;
  background: rgba(255,255,255,0.14); color: white; border: 0;
  width: 40px; height: 40px; border-radius: 20px; cursor: pointer; z-index: 10;
  display: inline-flex; align-items: center; justify-content: center;
}
#viewer-close { right: 16px; font-size: 24px; line-height: 1; }
#viewer-fullscreen { right: 64px; font-size: 18px; }
#viewer-close:hover, #viewer-fullscreen:hover { background: rgba(255,255,255,0.25); }
#viewer-caption {
  margin-top: 12px; color: #ddd; font-size: 13px;
  background: rgba(0,0,0,0.55); padding: 6px 12px; border-radius: 4px;
  max-width: 90vw; text-align: center; word-break: break-all;
}
.maplibregl-ctrl-attrib { font-size: 10px; }
</style>
</head>
<body>
<div id="app">
  <header id="topbar">
    <span id="title">${escaped}</span>
    <span id="count">${photos.length} photo${photos.length === 1 ? '' : 's'}</span>
    <label class="toggle">
      <input type="checkbox" id="thumbs-checkbox" checked />
      <span>Show thumbnails</span>
    </label>
  </header>
  <div id="map"></div>
</div>
<div id="viewer" hidden>
  <button id="viewer-close" aria-label="Close">×</button>
  <button id="viewer-fullscreen" aria-label="Full screen">⛶</button>
  <div id="viewer-stage">
    <img id="viewer-img" alt="" />
  </div>
  <div id="viewer-caption"></div>
</div>
<script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>
<script id="photos-data" type="application/json">${escapeJsonForScript(dataJson)}</script>
<script>
window.__PHOTOS__ = JSON.parse(document.getElementById('photos-data').textContent);
${runtimeSource}
</script>
</body>
</html>`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeJsonForScript(json) {
  return json.replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}
