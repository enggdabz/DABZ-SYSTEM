/**
 * Checking a file before it is stored (docs/spec.md 6.5, 12).
 *
 * "Check type by content, not just by extension." A name ending `.jpg` is a
 * claim the person uploading made; the first few bytes of a file are what it
 * actually is. So every upload is read far enough to see its signature, and
 * anything that does not match one of the handful of types the shop accepts is
 * refused - whatever it is called.
 *
 * This is also the reason the customer's upload goes through a Server Action
 * rather than straight into storage with a signed URL as the specification
 * sketches: a browser holding an upload URL can put anything at the other end
 * of it, and a server holding the bytes can look at them.
 */

export interface UploadKind {
  mime: string;
  extension: string;
  /** The first bytes a file of this type starts with. */
  signature: number[];
  /** Some formats need a second check further in (WebP's "WEBP" at byte 8). */
  at8?: number[];
}

const JPEG: UploadKind = { mime: "image/jpeg", extension: "jpg", signature: [0xff, 0xd8, 0xff] };
const PNG: UploadKind = {
  mime: "image/png",
  extension: "png",
  signature: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
};
const WEBP: UploadKind = {
  mime: "image/webp",
  extension: "webp",
  // "RIFF" then four bytes of length then "WEBP".
  signature: [0x52, 0x49, 0x46, 0x46],
  at8: [0x57, 0x45, 0x42, 0x50],
};
const PDF: UploadKind = {
  mime: "application/pdf",
  extension: "pdf",
  signature: [0x25, 0x50, 0x44, 0x46],
};

/** Pictures only - a product photo and a jersey mockup. */
export const IMAGE_KINDS: UploadKind[] = [JPEG, PNG, WEBP];
/** What a customer may attach to an order: pictures, and a PDF layout. */
export const ORDER_FILE_KINDS: UploadKind[] = [JPEG, PNG, WEBP, PDF];

export const UPLOAD_LIMITS = {
  /** docs/spec.md 6.5 - a product photo or a design mockup. */
  imageBytes: 5 * 1024 * 1024,
  /** A customer's artwork, which is often a big PDF. */
  orderFileBytes: 20 * 1024 * 1024,
} as const;

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

/** What this file actually is, or null when it is nothing we accept. */
export function detectKind(
  bytes: Uint8Array,
  allowed: readonly UploadKind[],
): UploadKind | null {
  for (const kind of allowed) {
    if (!startsWith(bytes, kind.signature)) continue;
    if (kind.at8 && !startsWith(bytes, kind.at8, 8)) continue;
    return kind;
  }
  return null;
}

export type UploadCheck =
  | { ok: true; kind: UploadKind }
  | { ok: false; error: string };

export function checkUpload(
  bytes: Uint8Array,
  options: { allowed: readonly UploadKind[]; maxBytes: number; what: string },
): UploadCheck {
  if (bytes.length === 0) {
    return { ok: false, error: "That file is empty." };
  }

  if (bytes.length > options.maxBytes) {
    const mb = Math.round(options.maxBytes / (1024 * 1024));
    return { ok: false, error: `${options.what} must be under ${mb}MB.` };
  }

  const kind = detectKind(bytes, options.allowed);
  if (kind === null) {
    const names = [...new Set(options.allowed.map((k) => k.extension.toUpperCase()))];
    return {
      ok: false,
      error: `That does not look like a ${names.join(", ")} file, whatever it is called.`,
    };
  }

  return { ok: true, kind };
}

/**
 * A safe name for a stored file.
 *
 * The person's own name for it is kept in the database and shown on screen;
 * what goes in the path is generated, because a filename is user input and a
 * path is a place. Slashes, dots and unicode in a storage key have caused
 * every kind of trouble somewhere.
 */
export function storageKey(prefix: string, extension: string): string {
  const random = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}/${random}.${extension}`;
}

/** What to show beside a file the customer attached. */
export function cleanOriginalName(name: string): string {
  const trimmed = name.trim().replace(/[\r\n\t]/g, " ");
  return trimmed.length === 0 ? "attachment" : trimmed.slice(0, 120);
}
