/**
 * Making a product photo small before it is uploaded (browser only).
 *
 * A photo straight off a phone is 3-5MB and 4000px across; the Counter shows
 * it at 48px. Cropping it to the middle square and shrinking it to 400px here
 * means the upload takes a moment on the shop's connection rather than half a
 * minute, and every Counter page load fetches a few kilobytes per row instead
 * of megabytes.
 *
 * The server still checks what arrives by its content - this is a courtesy
 * to the connection, not the rule.
 */
import { PHOTO_SIZE, centreSquare } from "./product-photo";

/** Reads the picture, the right way up. */
async function decode(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      // A phone stores "this way up" as a tag rather than turning the pixels;
      // without this a portrait photo can arrive on its side.
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Fall through: some browsers refuse the options object.
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * The photo as a 400px square (smaller only if the photo itself is smaller),
 * as WebP - or JPEG on a browser that cannot write WebP.
 *
 * Throws if the picture cannot be read at all; the caller says so and keeps
 * the old photo.
 */
export async function squarePhoto(file: File): Promise<File> {
  const picture = await decode(file);
  const width = "naturalWidth" in picture ? picture.naturalWidth : picture.width;
  const height = "naturalHeight" in picture ? picture.naturalHeight : picture.height;
  if (!width || !height) throw new Error("The photo could not be read.");

  const { x, y, side } = centreSquare(width, height);
  const size = Math.min(PHOTO_SIZE, side);

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("The photo could not be resized.");

  // A transparent PNG would turn black as a JPEG; white is what a product
  // photo is usually taken against anyway.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, size, size);
  context.imageSmoothingQuality = "high";
  context.drawImage(picture, x, y, side, side, 0, 0, size, size);
  if ("close" in picture) picture.close();

  // Safari asked for WebP hands back a PNG instead, so the type is checked.
  let blob = await toBlob(canvas, "image/webp", 0.82);
  if (!blob || blob.type !== "image/webp") blob = await toBlob(canvas, "image/jpeg", 0.85);
  if (!blob) throw new Error("The photo could not be resized.");

  const extension = blob.type === "image/webp" ? "webp" : "jpg";
  return new File([blob], `photo.${extension}`, { type: blob.type });
}
