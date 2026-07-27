const PHOTO_EXT = /\.(jpe?g|png|heic|heif|tiff?|webp|avif)$/i;
const CONCURRENCY = 4;

export async function scanFolder(dirHandle, { onPhoto, onScanned }) {
  const worker = new Worker(new URL('./scan.worker.js', import.meta.url), { type: 'module' });
  const pending = new Map();
  let nextId = 0;

  worker.onmessage = (e) => {
    const { id, ok, result } = e.data;
    const resolve = pending.get(id);
    if (resolve) {
      pending.delete(id);
      resolve(ok ? result : null);
    }
  };

  const parseInWorker = (file) => new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, resolve);
    worker.postMessage({ id, file });
  });

  const queue = [];
  async function walk(handle, path) {
    for await (const entry of handle.values()) {
      const entryPath = path ? `${path}/${entry.name}` : entry.name;
      if (entry.kind === 'directory') {
        await walk(entry, entryPath);
      } else if (entry.kind === 'file' && PHOTO_EXT.test(entry.name)) {
        queue.push({ handle: entry, path: entryPath });
      }
    }
  }
  await walk(dirHandle, '');

  let cursor = 0;
  async function worker_loop() {
    while (cursor < queue.length) {
      const idx = cursor++;
      const { handle, path } = queue[idx];
      let file;
      try {
        file = await handle.getFile();
      } catch {
        onScanned?.();
        continue;
      }
      const meta = await parseInWorker(file);
      onScanned?.();
      if (meta && Number.isFinite(meta.lat) && Number.isFinite(meta.lng)) {
        onPhoto({
          id: path,
          path,
          name: file.name,
          lat: meta.lat,
          lng: meta.lng,
          date: meta.date,
          fileHandle: handle,
          file
        });
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker_loop));
  worker.terminate();
}
