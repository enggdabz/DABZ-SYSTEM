import { describe, expect, it } from "vitest";

import {
  checkUpload,
  cleanOriginalName,
  detectKind,
  IMAGE_KINDS,
  ORDER_FILE_KINDS,
  storageKey,
  UPLOAD_LIMITS,
} from "./uploads";

const bytes = (...values: number[]) => new Uint8Array(values);

const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00);
const WEBP = bytes(
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
);
const PDF = bytes(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31);

describe("detectKind", () => {
  it("recognises the three picture formats by their first bytes", () => {
    expect(detectKind(JPEG, IMAGE_KINDS)?.mime).toBe("image/jpeg");
    expect(detectKind(PNG, IMAGE_KINDS)?.mime).toBe("image/png");
    expect(detectKind(WEBP, IMAGE_KINDS)?.mime).toBe("image/webp");
  });

  it("does not take RIFF on its own for a WebP", () => {
    // RIFF is also a WAV and an AVI. The "WEBP" at byte 8 is what settles it.
    const wav = bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45);
    expect(detectKind(wav, IMAGE_KINDS)).toBeNull();
  });

  it("does not accept a PDF where only pictures are allowed", () => {
    expect(detectKind(PDF, IMAGE_KINDS)).toBeNull();
    expect(detectKind(PDF, ORDER_FILE_KINDS)?.mime).toBe("application/pdf");
  });

  it("refuses something that is not any of them, however it is named", () => {
    /*
      The rule the module exists for. `logo.jpg` that is really a script is
      still a script; only the bytes say what a file is.
    */
    const script = new TextEncoder().encode("<?php system($_GET['x']); ?>");
    expect(detectKind(script, ORDER_FILE_KINDS)).toBeNull();
  });
});

describe("checkUpload", () => {
  const options = {
    allowed: IMAGE_KINDS,
    maxBytes: UPLOAD_LIMITS.imageBytes,
    what: "A photo",
  };

  it("accepts an ordinary picture", () => {
    expect(checkUpload(JPEG, options)).toEqual({
      ok: true,
      kind: expect.objectContaining({ mime: "image/jpeg" }),
    });
  });

  it("refuses an empty file rather than storing nothing", () => {
    expect(checkUpload(new Uint8Array(), options).ok).toBe(false);
  });

  it("refuses one that is too big, and says how big is allowed", () => {
    const huge = new Uint8Array(UPLOAD_LIMITS.imageBytes + 1);
    huge.set(JPEG);
    const result = checkUpload(huge, options);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("5MB");
  });

  it("names the formats it does take", () => {
    const result = checkUpload(PDF, options);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("JPG");
  });
});

describe("storageKey", () => {
  it("never puts the person's own filename in the path", () => {
    const key = storageKey("products", "jpg");
    expect(key).toMatch(/^products\/[a-z0-9-]+\.jpg$/);
  });

  it("does not collide with itself", () => {
    const keys = new Set(
      Array.from({ length: 200 }, () => storageKey("products", "png")),
    );
    expect(keys.size).toBe(200);
  });
});

describe("cleanOriginalName", () => {
  it("keeps what the customer called it, tidied", () => {
    expect(cleanOriginalName("  team logo.png ")).toBe("team logo.png");
  });

  it("does not let a name break the line it is printed on", () => {
    expect(cleanOriginalName("a\nb")).toBe("a b");
  });

  it("has something to show for a file with no name at all", () => {
    expect(cleanOriginalName("   ")).toBe("attachment");
  });
});
