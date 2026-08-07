import { initMap, addPhotos, clearPhotos, setPhotoImage, setThumbsVisible } from './map.js';
import { scanFolder } from './scan.js';
import { openViewer, initViewer } from './viewer.js';
import { makeThumb } from './thumbs.js';

const pickBtn = document.getElementById('pick-folder');
const statusEl = document.getElementById('status');
const unsupportedEl = document.getElementById('unsupported');

initMap();
initViewer();

const intro = document.getElementById('intro');
const introClose = document.getElementById('intro-close');
const introDontShow = document.getElementById('intro-dont-show');
const INTRO_KEY = 'photomap.hideIntro';
if (localStorage.getItem(INTRO_KEY) !== '1') {
  intro.showModal();
}
introClose.addEventListener('click', () => {
  if (introDontShow.checked) localStorage.setItem(INTRO_KEY, '1');
  intro.close();
});
intro.addEventListener('cancel', (e) => e.preventDefault());

const thumbsCheckbox = document.getElementById('thumbs-checkbox');
const THUMBS_KEY = 'photomap.showThumbs';
const savedThumbs = localStorage.getItem(THUMBS_KEY);
if (savedThumbs !== null) thumbsCheckbox.checked = savedThumbs === '1';
setThumbsVisible(thumbsCheckbox.checked);
thumbsCheckbox.addEventListener('change', () => {
  localStorage.setItem(THUMBS_KEY, thumbsCheckbox.checked ? '1' : '0');
  setThumbsVisible(thumbsCheckbox.checked);
});

if (!window.showDirectoryPicker) {
  pickBtn.disabled = true;
  unsupportedEl.hidden = false;
  statusEl.hidden = true;
}

let sessionToken = 0;

const fastQueue = [];
const heicQueue = [];
const FAST_MAX = 4;
const HEIC_MAX = 1;
let fastInFlight = 0;
let heicInFlight = 0;

function queueThumb(photo, token) {
  const q = /\.(heic|heif)$/i.test(photo.name) ? heicQueue : fastQueue;
  q.push({ photo, token });
  pumpThumbs();
}

function pumpThumbs() {
  while (fastInFlight < FAST_MAX && fastQueue.length) {
    startThumb(fastQueue.shift(), 'fast');
  }
  while (heicInFlight < HEIC_MAX && heicQueue.length && fastQueue.length === 0) {
    startThumb(heicQueue.shift(), 'heic');
  }
}

function startThumb(job, lane) {
  if (lane === 'fast') fastInFlight++;
  else heicInFlight++;
  makeThumb(job.photo.file)
    .then((bitmap) => {
      if (job.token === sessionToken) setPhotoImage(job.photo.id, bitmap);
    })
    .catch((err) => {
      console.warn('thumb failed for', job.photo.name, err?.message || err);
    })
    .finally(() => {
      if (lane === 'fast') fastInFlight--;
      else heicInFlight--;
      pumpThumbs();
    });
}

function resetThumbQueues() {
  fastQueue.length = 0;
  heicQueue.length = 0;
}

pickBtn.addEventListener('click', async () => {
  let dirHandle;
  try {
    dirHandle = await window.showDirectoryPicker({ mode: 'read' });
  } catch (e) {
    if (e.name === 'AbortError') return;
    console.error(e);
    statusEl.textContent = 'Could not open folder: ' + e.message;
    return;
  }

  sessionToken++;
  const token = sessionToken;
  resetThumbQueues();
  clearPhotos();
  statusEl.textContent = 'Scanning…';

  let scanned = 0;
  let geoCount = 0;
  const batch = [];

  const flush = () => {
    if (batch.length) addPhotos(batch.splice(0));
  };

  await scanFolder(dirHandle, {
    onPhoto(photo) {
      geoCount++;
      batch.push(photo);
      queueThumb(photo, token);
      if (batch.length >= 25) flush();
      statusEl.textContent = `${geoCount} geotagged / ${scanned} scanned…`;
    },
    onScanned() {
      scanned++;
      if (scanned % 25 === 0) {
        statusEl.textContent = `${geoCount} geotagged / ${scanned} scanned…`;
      }
    }
  });

  flush();
  statusEl.textContent =
    `Done — ${geoCount} geotagged photo${geoCount === 1 ? '' : 's'} of ${scanned} scanned`;
});

window.addEventListener('photo-click', (e) => openViewer(e.detail));
