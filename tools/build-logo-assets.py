#!/usr/bin/env python3
"""Derive every icon/social size from public/logo/logo.png.

The source lockup is never redrawn - assets are crops and Lanczos rescales of
the original artwork, so the logo's identity is untouched. Re-run this after
replacing logo.png:

    pip install Pillow && python3 tools/build-logo-assets.py
"""
from PIL import Image
from collections import deque
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOGO = ROOT / "public" / "logo" / "logo.png"
PUB = ROOT / "public"
LOGODIR = PUB / "logo"

DARK = (13, 13, 15)          # brand dark surface the lockup is designed for
BG_TOLERANCE = 6             # only strips near-pure #FFFFFF, keeps the #EFEFEE tagline


def knockout_background(im):
    """Flood-fill the flat white backdrop from the border and make it alpha=0.

    Only white *connected to the edge* is removed, so white inside the crest
    and the counters of the letters survive. The near-white #EFEFEE
    PRINTSHOPPE tagline is well outside the tolerance and is never touched.
    """
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()

    def is_bg(p):
        return p[3] == 255 and all(v >= 255 - BG_TOLERANCE for v in p[:3])

    seen = bytearray(w * h)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if is_bg(px[x, y]) and not seen[y * w + x]:
                seen[y * w + x] = 1
                q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if is_bg(px[x, y]) and not seen[y * w + x]:
                seen[y * w + x] = 1
                q.append((x, y))

    while q:
        x, y = q.popleft()
        px[x, y] = (255, 255, 255, 0)
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx] and is_bg(px[nx, ny]):
                seen[ny * w + nx] = 1
                q.append((nx, ny))
    return im


def square(im, pad_ratio=0.0, bg=None):
    """Centre the artwork on a square canvas, optionally padded and filled."""
    im = im.crop(im.getbbox())
    side = int(max(im.size) * (1 + pad_ratio * 2))
    canvas = Image.new("RGBA", (side, side), (bg + (255,)) if bg else (0, 0, 0, 0))
    canvas.paste(im, ((side - im.width) // 2, (side - im.height) // 2), im)
    return canvas


def save(im, path, size=None, bg=None):
    out = im
    if size:
        out = out.resize(size, Image.LANCZOS)
    if bg:
        flat = Image.new("RGBA", out.size, bg + (255,))
        flat.alpha_composite(out)
        out = flat
    # The art uses ~156 colours, so a palette costs nothing visually and
    # cuts file size by roughly 5x. FASTOCTREE keeps per-entry alpha.
    out = out.convert("RGBA").quantize(colors=256, method=Image.FASTOCTREE)
    out.save(path, optimize=True)
    print(f"  {path.relative_to(ROOT)}  {out.size[0]}x{out.size[1]}  {path.stat().st_size // 1024} KB")


def main():
    src = Image.open(LOGO)
    print(f"source: {LOGO.relative_to(ROOT)}  {src.size[0]}x{src.size[1]}")

    cut = knockout_background(src)
    save(cut, LOGODIR / "logo-transparent.png")

    # Emblem only - everything left of the gap between crest and wordmark.
    gap = 360
    mark = square(cut.crop((0, 0, gap, cut.height)))
    save(mark, LOGODIR / "logo-mark.png", (512, 512))

    print("icons:")
    save(mark, PUB / "icon-192.png", (192, 192))
    save(mark, PUB / "icon-512.png", (512, 512))
    # iOS composites transparency onto black, so ship it pre-flattened.
    save(mark, PUB / "apple-touch-icon.png", (180, 180), bg=DARK)
    # Android adaptive icons crop to a circle - keep art inside the centre 80%.
    save(square(mark, pad_ratio=0.18, bg=DARK), PUB / "icon-512-maskable.png", (512, 512))

    ico = PUB / "favicon.ico"
    mark.resize((64, 64), Image.LANCZOS).save(ico, sizes=[(16, 16), (32, 32), (48, 48)])
    print(f"  {ico.relative_to(ROOT)}  multi-res  {ico.stat().st_size // 1024} KB")

    # Social card: full lockup on the dark surface it was designed for.
    og = Image.new("RGBA", (1200, 630), DARK + (255,))
    lock = cut.crop(cut.getbbox())
    scale = min(920 / lock.width, 260 / lock.height)
    lock = lock.resize((int(lock.width * scale), int(lock.height * scale)), Image.LANCZOS)
    og.alpha_composite(lock, ((1200 - lock.width) // 2, (630 - lock.height) // 2))
    save(og, PUB / "og-image.png")


if __name__ == "__main__":
    main()
