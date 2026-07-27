let heic2anyPromise;

async function load() {
  if (!heic2anyPromise) {
    heic2anyPromise = import('heic2any').then((m) => m.default || m);
  }
  return heic2anyPromise;
}

export async function decodeHeic(file) {
  const heic2any = await load();
  const result = await heic2any({
    blob: file,
    toType: 'image/jpeg',
    quality: 0.9
  });
  return Array.isArray(result) ? result[0] : result;
}
