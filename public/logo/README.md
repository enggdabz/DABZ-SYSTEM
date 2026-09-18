# DABZ PRINTSHOPPE - logo assets

Everything under `public/` is served from the site root, so
`public/logo/logo.png` is reachable at `/logo/logo.png` - no import, no
bundler config, no copy step.

## Files

| Path                             | Size       | What it is                                    |
| -------------------------------- | ---------- | --------------------------------------------- |
| `logo/logo.png`                  | 1200 x 328 | **The original, byte-for-byte untouched.** Opaque white background. |
| `logo/logo-transparent.png`      | 1200 x 328 | Same artwork, flat white backdrop removed. Use this on screen. |
| `logo/logo-mark.png`             | 512 x 512  | Crest only, transparent. For tight spaces.    |
| `favicon.ico`                    | 16/32/48   | Browser tab                                   |
| `apple-touch-icon.png`           | 180 x 180  | iOS home screen (pre-flattened on dark - iOS has no alpha) |
| `icon-192.png` / `icon-512.png`  | PWA        | Android / installable app                     |
| `icon-512-maskable.png`          | 512 x 512  | Android adaptive icon, art inside centre 80%  |
| `og-image.png`                   | 1200 x 630 | Link previews                                 |

Every derived file is a crop or Lanczos rescale of the original artwork.
Nothing was redrawn, recoloured or restyled.

## The one rule: put it on a dark background

The artwork is built for a dark ground. Measured off the file itself:

| Element       | Colour    | On white   | On `#0D0D0F` |
| ------------- | --------- | ---------- | ------------ |
| `DABZ`        | `#D30808` | 5.51:1     | 3.52:1       |
| `PRINTSHOPPE` | `#EFEFEE` | **1.15:1** | 16.87:1      |

At 1.15:1 the tagline is invisible on white - it is near-white type. The
crest's silver filigree washes out the same way. Do not fix this by
recolouring the logo; put it on a dark surface, or on a dark plate:

```html
<span class="logo-plate">
  <img class="logo" src="/logo/logo-transparent.png" alt="DABZ PRINTSHOPPE">
</span>
```

## Minimum sizes

- **Full lockup: 56px tall minimum.** The tagline is only 12% of the
  lockup's height, so below that it stops resolving.
- **Crest alone: 48px minimum.** The filigree turns to mush at 32px and
  below - that is why anything tighter (mobile header, favicon) uses the
  crest, and why the 16px favicon reads as a red shape rather than a mark.
- Never set both `width` and `height` in CSS - set height only and let the
  width follow, or the lockup gets stretched.

## Brand colours

Sampled from the artwork. The app's own tokens live in
`src/app/globals.css`; these are the raw values measured off the logo:

```
--dabz-red:        #D30808   /* wordmark + monogram */
--dabz-red-bright: #EE0808   /* highlight tone, used for hover */
--dabz-ink:        #000000   /* crest linework */
--dabz-tagline:    #EFEFEE   /* PRINTSHOPPE */
--surface:         #0D0D0F   /* the dark ground */
```

## Using it

```html
<img src="/logo/logo-transparent.png" alt="DABZ PRINTSHOPPE" height="56">
```

```jsx
<img src="/logo/logo-transparent.png" alt="DABZ PRINTSHOPPE" height={56} />
```

```css
.brand { background-image: url("/logo/logo-transparent.png"); }
```

## If you replace the logo

Drop the new file in as `logo/logo.png` and re-run:

```bash
pip install Pillow && python3 tools/build-logo-assets.py
```

That regenerates every icon and the social card from the new artwork.

## Worth having later

The source here is a raster PNG. An **SVG** (or the original Illustrator /
Photoshop vector) would stay razor sharp at any size, print cleanly, and
drop the header logo from ~32 KB to a couple of KB. If you have the vector
file from whoever designed this, add it as `logo/logo.svg` and point
`Wordmark` in `src/components/ui.tsx` at it - everything else keeps working.
