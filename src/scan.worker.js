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
    try {
      const meta = await exifr.parse(file, ['DateTimeOriginal', 'CreateDate']);
      date = meta?.DateTimeOriginal || meta?.CreateDate || null;
    } catch {}
    self.postMessage({
      id,
      ok: true,
      result: { lat: gps.latitude, lng: gps.longitude, date }
    });
  } catch (err) {
    self.postMessage({ id, ok: false, error: err?.message });
  }
};
