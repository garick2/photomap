import { initMap, addPhotos, clearPhotos } from './map.js';
import { scanFolder } from './scan.js';
import { openViewer, initViewer } from './viewer.js';

const pickBtn = document.getElementById('pick-folder');
const statusEl = document.getElementById('status');
const unsupportedEl = document.getElementById('unsupported');

initMap();
initViewer();

if (!window.showDirectoryPicker) {
  pickBtn.disabled = true;
  unsupportedEl.hidden = false;
  statusEl.hidden = true;
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
