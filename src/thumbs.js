const INNER = 60;
const FRAME = 3;
const SIZE = INNER + FRAME * 2;
const PIXEL_RATIO = 2;
const RADIUS = 4;

export const THUMB_PIXEL_RATIO = PIXEL_RATIO;

export async function makeThumb(file) {
  const isHeic = /\.(heic|heif)$/i.test(file.name);
  let source = file;
  if (isHeic) {
    const { decodeHeic } = await import('./heic.js');
    source = await decodeHeic(file);
  }

  const full = await createImageBitmap(source, { imageOrientation: 'from-image' });
  try {
    const w = full.width;
    const h = full.height;
    const s = Math.min(w, h);
    const sx = (w - s) / 2;
    const sy = (h - s) / 2;

    const dim = SIZE * PIXEL_RATIO;
    const canvas = new OffscreenCanvas(dim, dim);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#ffffff';
    roundRect(ctx, 0, 0, dim, dim, RADIUS * PIXEL_RATIO);
    ctx.fill();

    ctx.save();
    roundRect(
      ctx,
      FRAME * PIXEL_RATIO,
      FRAME * PIXEL_RATIO,
      INNER * PIXEL_RATIO,
      INNER * PIXEL_RATIO,
      (RADIUS - 1) * PIXEL_RATIO
    );
    ctx.clip();
    ctx.drawImage(
      full,
      sx, sy, s, s,
      FRAME * PIXEL_RATIO,
      FRAME * PIXEL_RATIO,
      INNER * PIXEL_RATIO,
      INNER * PIXEL_RATIO
    );
    ctx.restore();

    return canvas.transferToImageBitmap();
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
