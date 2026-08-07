import {
  initMap, addPhotos, clearPhotos, setPhotoImage,
  setThumbsVisible, setPaths, setPathsVisible, setVisiblePhotoIds
} from './map.js';
import { scanFolder } from './scan.js';
import { openViewer, initViewer } from './viewer.js';
import { makeThumb } from './thumbs.js';
import { exportMap, saveHtml } from './exporter.js';
import {
  enrich, computePaths, inventory, filterPhotos, resetPathState
} from './paths.js';

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

// ============ Filter state and panel ============

const filtersBtn = document.getElementById('filters-btn');
const filterPanel = document.getElementById('filter-panel');
const filterClose = document.getElementById('filter-close');
const pathsToggle = document.getElementById('paths-toggle');
const personList = document.getElementById('person-list');
const dayList = document.getElementById('day-list');
const timeFrom = document.getElementById('time-from');
const timeTo = document.getElementById('time-to');
const rangeClear = document.getElementById('range-clear');

const filterState = {
  showPaths: false,
  people: null,   // null = all
  days: null,     // null = all
  from: null,     // ms
  to: null        // ms
};

filtersBtn.addEventListener('click', () => {
  filterPanel.hidden = !filterPanel.hidden;
});
filterClose.addEventListener('click', () => {
  filterPanel.hidden = true;
});
pathsToggle.addEventListener('change', () => {
  filterState.showPaths = pathsToggle.checked;
  setPathsVisible(filterState.showPaths);
});
timeFrom.addEventListener('change', () => {
  filterState.from = timeFrom.value ? new Date(timeFrom.value).getTime() : null;
  applyFilters();
});
timeTo.addEventListener('change', () => {
  filterState.to = timeTo.value ? new Date(timeTo.value).getTime() : null;
  applyFilters();
});
rangeClear.addEventListener('click', () => {
  timeFrom.value = '';
  timeTo.value = '';
  filterState.from = null;
  filterState.to = null;
  applyFilters();
});

function renderInventory() {
  const inv = inventory(currentPhotos);

  personList.innerHTML = '';
  for (const { person, count, color } of inv.people) {
    const label = document.createElement('label');
    label.className = 'chip';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !filterState.people || filterState.people.has(person);
    cb.addEventListener('change', () => {
      if (!filterState.people) {
        filterState.people = new Set(inv.people.map((p) => p.person));
      }
      if (cb.checked) filterState.people.add(person);
      else filterState.people.delete(person);
      applyFilters();
    });
    const sw = document.createElement('span');
    sw.className = 'swatch';
    sw.style.background = color;
    const name = document.createElement('span');
    name.className = 'label';
    name.textContent = person;
    const cnt = document.createElement('span');
    cnt.className = 'count';
    cnt.textContent = count;
    label.append(cb, sw, name, cnt);
    personList.appendChild(label);
  }

  dayList.innerHTML = '';
  for (const { dayKey, count } of inv.days) {
    const label = document.createElement('label');
    label.className = 'chip';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !filterState.days || filterState.days.has(dayKey);
    cb.addEventListener('change', () => {
      if (!filterState.days) {
        filterState.days = new Set(inv.days.map((d) => d.dayKey));
      }
      if (cb.checked) filterState.days.add(dayKey);
      else filterState.days.delete(dayKey);
      applyFilters();
    });
    const name = document.createElement('span');
    name.className = 'label';
    name.textContent = formatDayLabel(dayKey);
    const cnt = document.createElement('span');
    cnt.className = 'count';
    cnt.textContent = count;
    label.append(cb, name, cnt);
    dayList.appendChild(label);
  }

  if (inv.range.min != null) {
    timeFrom.min = toLocalInput(inv.range.min);
    timeTo.min = toLocalInput(inv.range.min);
  }
  if (inv.range.max != null) {
    timeFrom.max = toLocalInput(inv.range.max);
    timeTo.max = toLocalInput(inv.range.max);
  }
}

function formatDayLabel(dayKey) {
  const [y, m, d] = dayKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function toLocalInput(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function applyFilters() {
  const filtered = filterPhotos(currentPhotos, filterState);
  setVisiblePhotoIds(new Set(filtered.map((p) => p.id)));
  setPaths(computePaths(filtered));
}

// ============ Scan flow ============

const saveBtn = document.getElementById('save-map');
let currentPhotos = [];
let currentFolderName = '';

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
  resetPathState();
  clearPhotos();
  currentPhotos = [];
  currentFolderName = dirHandle.name || 'PhotoMap';
  saveBtn.hidden = true;
  filtersBtn.hidden = true;
  filterPanel.hidden = true;
  filterState.people = null;
  filterState.days = null;
  filterState.from = null;
  filterState.to = null;
  timeFrom.value = '';
  timeTo.value = '';
  statusEl.textContent = 'Scanning…';

  let scanned = 0;
  let geoCount = 0;
  const batch = [];

  const flush = () => {
    if (batch.length) addPhotos(batch.splice(0));
  };

  await scanFolder(dirHandle, {
    onPhoto(rawPhoto) {
      geoCount++;
      const photo = enrich(rawPhoto);
      batch.push(photo);
      currentPhotos.push(photo);
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
  saveBtn.hidden = geoCount === 0;
  filtersBtn.hidden = geoCount === 0;
  renderInventory();
  applyFilters();
});

// ============ Export ============

const exportDialog = document.getElementById('export-dialog');
const exportStatus = document.getElementById('export-status');
const exportBar = document.getElementById('export-bar');
const exportCancel = document.getElementById('export-cancel');
let exportAbort = null;

saveBtn.addEventListener('click', async () => {
  const visible = filterPhotos(currentPhotos, filterState);
  if (!visible.length) return;
  exportAbort = new AbortController();
  exportStatus.textContent = `Preparing 0 / ${visible.length}…`;
  exportBar.style.width = '0%';
  exportDialog.showModal();

  let result;
  try {
    result = await exportMap(visible, {
      title: currentFolderName,
      showPaths: filterState.showPaths,
      paths: computePaths(visible),
      signal: exportAbort.signal,
      onProgress: ({ done, total }) => {
        exportStatus.textContent = `Generating previews… ${done} / ${total}`;
        exportBar.style.width = `${(done / total) * 100}%`;
      }
    });
  } catch (e) {
    if (e.message !== 'aborted') {
      console.error(e);
      exportStatus.textContent = 'Failed: ' + e.message;
      return;
    }
    exportDialog.close();
    return;
  }

  exportStatus.textContent = 'Saving file…';
  const stamp = new Date().toISOString().slice(0, 10);
  const fileName = `${sanitize(currentFolderName)}-photomap-${stamp}.html`;
  const saved = await saveHtml(result.html, fileName);
  exportDialog.close();
  if (saved.saved) {
    statusEl.textContent = `Saved ${result.count} photo${result.count === 1 ? '' : 's'} as ${fileName}`;
  }
});

exportCancel.addEventListener('click', () => {
  exportAbort?.abort();
  exportDialog.close();
});
exportDialog.addEventListener('cancel', (e) => e.preventDefault());

function sanitize(s) {
  return String(s).replace(/[^a-z0-9_-]+/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'photomap';
}

window.addEventListener('photo-click', (e) => openViewer(e.detail));
