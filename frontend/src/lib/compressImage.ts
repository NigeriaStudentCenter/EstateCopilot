// Best-effort client-side downscale before upload. On Nigerian mobile data a
// 5 MB phone photo takes ~30s to send; re-drawn to ~1600px JPEG it's ~300 KB.
// The server re-encodes again (it's the source of truth for size/format), so if
// anything here fails — HEIC that the browser can't decode, a huge image, an
// odd codec — we just hand back the original file and let the server deal with it.
const MAX_EDGE = 1600;
const QUALITY = 0.8;

export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 1_000_000) {
      bitmap.close?.();
      return file; // already small enough, don't bother
    }
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', QUALITY),
    );
    if (!blob || blob.size >= file.size) return file; // no win — keep original

    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() });
  } catch {
    return file;
  }
}
