/**
 * Thin wrapper around @vercel/blob that degrades gracefully when the store
 * isn't configured (local dev without BLOB_READ_WRITE_TOKEN). Callers should
 * assume `null` means "no persistent storage available" and handle the
 * absence in the UI ("receipts not saved").
 */

export type BlobUploadInput = {
  filename: string;
  content: Buffer;
  contentType?: string;
  /** Folder prefix inside the blob store, e.g. "expense-reports/<id>". */
  pathPrefix: string;
};

export type BlobUploadResult = {
  url: string;
  pathname: string;
};

export function isBlobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

/**
 * Upload a receipt to Vercel Blob if configured. Returns `null` when Blob is
 * unavailable (missing token) so submissions can still succeed with a warning.
 * Throws on upload failure when Blob IS configured — the caller decides
 * whether to abort or continue.
 */
export async function uploadBlob(
  input: BlobUploadInput,
): Promise<BlobUploadResult | null> {
  if (!isBlobConfigured()) return null;
  // Lazy import so environments without the package installed still typecheck
  // and boot (the dependency IS installed, but this defends against future
  // pruning during a size-conscious deploy).
  const { put } = await import("@vercel/blob");
  const safeName = input.filename.replace(/[^\w.\-]+/g, "_");
  const pathname = `${input.pathPrefix.replace(/^\/+|\/+$/g, "")}/${Date.now()}-${safeName}`;
  const res = await put(pathname, input.content, {
    access: "public",
    contentType: input.contentType,
    addRandomSuffix: false,
  });
  return { url: res.url, pathname: res.pathname };
}

export async function deleteBlob(url: string): Promise<void> {
  if (!isBlobConfigured()) return;
  const { del } = await import("@vercel/blob");
  try {
    await del(url);
  } catch {
    // A missing blob shouldn't block ER edits — silently swallow.
  }
}

/**
 * Fetch a Blob URL as a Buffer, for embedding into the ER PDF at approval
 * time. Returns `null` on failure so the PDF can still render without it.
 */
export async function fetchBlob(
  url: string,
): Promise<{ content: Buffer; contentType: string | null } | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type");
    const ab = await res.arrayBuffer();
    return { content: Buffer.from(ab), contentType };
  } catch {
    return null;
  }
}
