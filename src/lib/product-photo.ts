/**
 * A Counter product's photo (the owner's request, 2 Oct 2026).
 *
 * The checks a person gets an answer to straight away, in the browser, before
 * anything is uploaded. The server checks again by the file's CONTENT
 * (src/lib/online/uploads.ts) - a file's type as the browser reports it is
 * only what the file is called.
 */

/** What may be chosen. HEIC and GIF are not on it; a phone offers JPEG anyway. */
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** For the file picker's `accept`. */
export const PHOTO_ACCEPT = PHOTO_TYPES.join(",");

/** The photo as chosen, before it is made small. The same 5MB as the online shop. */
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

/** Every stored photo is this many pixels square. Shown at 48px, so 400 is plenty. */
export const PHOTO_SIZE = 400;

/** Where Counter photos go inside the `product-images` bucket. */
export const COUNTER_PHOTO_PREFIX = "counter";

/** Null when the file may be used; otherwise what to tell the person. */
export function photoFileProblem(file: { type: string; size: number }): string | null {
  if (!(PHOTO_TYPES as readonly string[]).includes(file.type)) {
    return "That file type is not accepted. Choose a JPG, PNG or WebP photo.";
  }
  if (file.size === 0) {
    return "That file is empty. Choose another photo.";
  }
  if (file.size > PHOTO_MAX_BYTES) {
    return "That photo is over 5 MB. Choose a smaller one.";
  }
  return null;
}

/**
 * The square in the middle of a picture: what is kept when it is cropped.
 *
 * The middle rather than the top, because a product photo is usually taken
 * with the product in the middle of the frame.
 */
export function centreSquare(width: number, height: number): {
  x: number;
  y: number;
  side: number;
} {
  const side = Math.min(width, height);
  return {
    x: Math.floor((width - side) / 2),
    y: Math.floor((height - side) / 2),
    side,
  };
}
