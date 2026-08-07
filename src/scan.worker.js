import exifr from 'exifr';

self.onmessage = async (e) => {
  const { id, file } = e.data;
  try {
    const gps = await exifr.gps(file);
    if (!gps || !Number.isFinite(gps.latitude) || !Number.isFinite(gps.longitude)) {
      self.postMessage({ id, ok: false });
      return;
    }
    let date = null;
    let make = null;
    let model = null;
    try {
      const meta = await exifr.parse(file, ['DateTimeOriginal', 'CreateDate', 'Make', 'Model']);
      date = meta?.DateTimeOriginal || meta?.CreateDate || null;
      make = meta?.Make ? String(meta.Make).trim() : null;
      model = meta?.Model ? String(meta.Model).trim() : null;
    } catch {}
    self.postMessage({
      id,
      ok: true,
      result: { lat: gps.latitude, lng: gps.longitude, date, make, model }
    });
  } catch (err) {
    self.postMessage({ id, ok: false, error: err?.message });
  }
};
