import { decodeHeic } from './heic.js';

const viewer = document.getElementById('viewer');
const img = document.getElementById('viewer-img');
const caption = document.getElementById('viewer-caption');
const loading = document.getElementById('viewer-loading');
const closeBtn = document.getElementById('viewer-close');
const fsBtn = document.getElementById('viewer-fullscreen');

let currentUrl = null;
let openToken = 0;

export function initViewer() {
  closeBtn.addEventListener('click', closeViewer);
  fsBtn.addEventListener('click', toggleFullscreen);
  viewer.addEventListener('click', (e) => {
    if (e.target === viewer) closeViewer();
  });
  document.addEventListener('keydown', (e) => {
    if (viewer.hidden) return;
    if (e.key === 'Escape') closeViewer();
    else if (e.key === 'f') toggleFullscreen();
  });
}

export async function openViewer(photo) {
  const token = ++openToken;
  viewer.hidden = false;
  img.removeAttribute('src');
  loading.hidden = false;
  releaseUrl();

  const parts = [photo.name];
  if (photo.date) parts.push(new Date(photo.date).toLocaleString());
  caption.textContent = parts.join(' — ');

  let file;
  try {
    file = photo.file || (await photo.fileHandle.getFile());
  } catch (e) {
    caption.textContent = 'Cannot read file: ' + e.message;
    loading.hidden = true;
    return;
  }

  let blob = file;
  if (/\.(heic|heif)$/i.test(file.name)) {
    try {
      blob = await decodeHeic(file);
    } catch (e) {
      caption.textContent = 'Could not decode HEIC: ' + e.message;
      loading.hidden = true;
      return;
    }
    if (token !== openToken) return;
  }

  currentUrl = URL.createObjectURL(blob);
  img.onload = () => { if (token === openToken) loading.hidden = true; };
  img.onerror = () => {
    if (token === openToken) {
      loading.hidden = true;
      caption.textContent = 'Failed to display image.';
    }
  };
  img.src = currentUrl;
}

function closeViewer() {
  openToken++;
  viewer.hidden = true;
  img.removeAttribute('src');
  loading.hidden = true;
  releaseUrl();
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}

function releaseUrl() {
  if (currentUrl) {
    URL.revokeObjectURL(currentUrl);
    currentUrl = null;
  }
}

function toggleFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else {
    viewer.requestFullscreen().catch((e) => {
      console.warn('Fullscreen failed:', e);
    });
  }
}
