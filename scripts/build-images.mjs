#!/usr/bin/env node
/* Builds the responsive image variants in img/ from each picture's master file.

   For every picture: AVIF and WebP at each width in its ladder (img/<name>-<width>.avif|webp), which
   the pages offer through <picture> / image-set(), plus the JPEG fallbacks old browsers get, re-derived
   from the master with mozjpeg. The masters themselves (the @2x / full-size originals and the PNG)
   are never rewritten here: re-encoding a lossy master on every run would compound the loss.

   Ladders follow the rendered sizes (measured at 320-1920 px wide, 1x-3x): e.g. the work-page
   screenshots are 286-957 CSS px wide, so 400/720/1000/1400 covers 1x phones to 2x desktops without
   sending a 2400 px file anywhere. Every width keeps the master's exact aspect ratio in whole pixels
   (16:10 needs a multiple of 8: 720, not 700): a loaded file's own ratio replaces the one the
   width/height attributes reserve, so a rounded height would nudge the layout.

   Qualities were picked by eye on 2x crops: screenshots (text) keep full colour (4:4:4) in AVIF; the
   photo and the 3D render use 4:2:0 at a higher quality, which keeps skin texture and the corrugated
   roof that lower settings smear.

   One-off, not repeated here: og-image.png was recompressed losslessly (identical pixels), and the
   calligraphy PNG master became a 256-colour palette (73.9 dB PSNR against the original: no visible
   change; it had an alpha channel that was opaque everywhere).

   sharp is not a dependency of the site. Run it with a throwaway install:
     npm i --no-save sharp@0.33 && node scripts/build-images.mjs
   or point SHARP at an existing copy: SHARP=/path/to/node_modules/sharp node scripts/build-images.mjs
   Output is deterministic for a given sharp version, so re-running only rewrites what changed. */
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(join(ROOT, 'package.json'));
const sharp = require(process.env.SHARP || 'sharp');

const SCREENSHOT = { avif: { quality: 60, chromaSubsampling: '4:4:4' }, webp: { quality: 82, smartSubsample: true } };
const RENDER = { avif: { quality: 72, chromaSubsampling: '4:2:0' }, webp: { quality: 85, smartSubsample: true } };

export const IMAGES = [
  {
    name: 'work-bibooks', master: 'img/work-bibooks@2x.jpg', widths: [400, 720, 1000, 1400], ...SCREENSHOT,
    // Fallback JPEGs keep their old names (other pages, scripts and tests point at them).
    jpeg: { 'img/work-bibooks-400.jpg': [400, 88], 'img/work-bibooks-600.jpg': [600, 84], 'img/work-bibooks.jpg': [1200, 72] },
  },
  {
    // Two flat colours with soft edges: AVIF holds them at a low quality.
    name: 'lab-square-word-calligraphy', master: 'img/lab-square-word-calligraphy.png', widths: [400, 700, 1000, 1200],
    avif: { quality: 55, chromaSubsampling: '4:4:4' }, webp: { quality: 85, smartSubsample: true },
  },
  {
    name: 'lab-nuestra-finca', master: 'img/lab-nuestra-finca.jpg', widths: [400, 700, 1000, 1200], ...RENDER,
    jpeg: { 'img/lab-nuestra-finca-720.jpg': [720, 76] },
  },
  {
    name: 'greyson-miller', master: 'img/greyson-miller@2x.jpg', widths: [192, 288, 384, 576], ...RENDER,
    jpeg: { 'img/greyson-miller.jpg': [384, 84] },
  },
];

const write = (rel, buf) => {
  const file = join(ROOT, rel);
  const same = existsSync(file) && readFileSync(file).equals(buf);
  if (!same) writeFileSync(file, buf);
  console.log(`${same ? '  ' : '✎ '}${rel.padEnd(44)} ${(buf.length / 1024).toFixed(1).padStart(6)} KB`);
};

for (const img of IMAGES) {
  const master = join(ROOT, img.master);
  const at = (w) => sharp(master).removeAlpha().resize({ width: w, withoutEnlargement: true, kernel: 'lanczos3' });
  for (const w of img.widths) {
    write(`img/${img.name}-${w}.avif`, await at(w).avif({ effort: 9, ...img.avif }).toBuffer());
    write(`img/${img.name}-${w}.webp`, await at(w).webp({ effort: 6, ...img.webp }).toBuffer());
  }
  for (const [rel, [w, quality]] of Object.entries(img.jpeg || {})) {
    write(rel, await at(w).jpeg({ quality, mozjpeg: true }).toBuffer());
  }
}
