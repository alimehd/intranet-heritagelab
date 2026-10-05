/**
 * Vercel rejects any serverless request body over 4.5 MB with a 413 before our
 * code runs, so the whole claim submission (JSON payload + all receipts) has to
 * fit under that. Keep the receipt budget a bit below the hard limit to leave
 * room for the JSON payload and multipart overhead.
 */
export const MAX_TOTAL_RECEIPT_BYTES = 4 * 1024 * 1024; // 4 MB total
export const MAX_RECEIPT_BYTES = MAX_TOTAL_RECEIPT_BYTES;

const MAX_IMAGE_DIMENSION = 1800;
const JPEG_QUALITY = 0.8;
/** Images smaller than this are left untouched. */
const SKIP_COMPRESS_BELOW = 300 * 1024;

/**
 * Downscale and re-encode a photo receipt as JPEG in the browser so phone
 * photos (often 3–10 MB) fit inside the upload limit. PDFs, and images the
 * browser can't decode (e.g. HEIC on Chrome), are returned unchanged.
 */
export async function compressReceipt(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size < SKIP_COMPRESS_BELOW) {
    return file;
  }
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(
      1,
      MAX_IMAGE_DIMENSION / Math.max(bitmap.width, bitmap.height),
    );
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    if (!blob || blob.size >= file.size) return file;
    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  }
}
