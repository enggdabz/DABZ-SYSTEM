# Logo assets

Drop your logo files in this folder using the exact filenames below.
Anything under `public/` is served from the site root, so
`public/logo/logo.svg` is reachable at `/logo/logo.svg` — no import,
no bundler config, no copying step.

## Files to add here

| Filename            | Format | Size            | Used for                                  |
| ------------------- | ------ | --------------- | ----------------------------------------- |
| `logo.svg`          | SVG    | any (vector)    | Primary logo — header, nav, docs          |
| `logo.png`          | PNG    | 1200 x 300      | Raster fallback for the full lockup       |
| `logo-dark.svg`     | SVG    | any (vector)    | Light-coloured variant for dark backgrounds |
| `logo-mark.svg`     | SVG    | square          | Icon / monogram only, no wordmark         |
| `logo-mark-512.png` | PNG    | 512 x 512       | Raster icon, app listings, README embeds  |

## Icons (put these at `public/`, not in this folder)

| Filename                 | Size           | Purpose                        |
| ------------------------ | -------------- | ------------------------------ |
| `favicon.ico`            | 16, 32, 48 multi-res | Browser tab (legacy)     |
| `icon.svg`               | square vector  | Browser tab (modern)           |
| `apple-touch-icon.png`   | 180 x 180      | iOS home screen                |
| `icon-192.png`           | 192 x 192      | Android / PWA                  |
| `icon-512.png`           | 512 x 512      | PWA splash, store listings     |
| `icon-512-maskable.png`  | 512 x 512      | Android adaptive icon — keep artwork inside the centre 80% |
| `og-image.png`           | 1200 x 630     | Link previews (OpenGraph, X)   |

## Rules of thumb

- **SVG first.** One file, sharp at every size, usually under 20 KB. Only
  reach for PNG when the logo has gradients, photos, or effects that do not
  vectorise cleanly.
- **Export PNG at 2x-3x its display size.** A header logo shown at 40px tall
  should be exported around 120px tall so it stays crisp on retina screens.
- **Keep transparent backgrounds** on every PNG except `og-image.png`, which
  needs a solid background because social platforms composite it on white.
- **Budget:** SVG under 20 KB, PNG under 100 KB, `og-image.png` under 300 KB.
- **Never scale a raster logo up** — export a bigger one from the source file.

## Using it

HTML:

```html
<img src="/logo/logo.svg" alt="Dabz System" height="40">
```

React / Next.js:

```jsx
<img src="/logo/logo.svg" alt="Dabz System" height={40} />
```

Markdown (README):

```markdown
![Dabz System](public/logo/logo.svg)
```

CSS:

```css
.brand { background-image: url("/logo/logo.svg"); }
```

Swapping the logo for dark mode:

```html
<picture>
  <source srcset="/logo/logo-dark.svg" media="(prefers-color-scheme: dark)">
  <img src="/logo/logo.svg" alt="Dabz System" height="40">
</picture>
```

## `<head>` snippet for the icons

```html
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/manifest.webmanifest">
<meta property="og:image" content="/og-image.png">
```
