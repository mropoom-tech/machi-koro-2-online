// Converts card art in asset/card_images into compact WebP files served (privately) by the Worker.
// Output is gitignored: apps/worker/card-assets/{th,en}/{cardId}.webp
// Usage: node tools/build-card-assets.mjs [--proof <dir>]   (--proof also writes small JPEGs for review)
import sharp from 'sharp';
import { mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

const SRC = 'asset/card_images';
const OUT = 'apps/worker/card-assets';
const proofIdx = process.argv.indexOf('--proof');
const proofDir = proofIdx > 0 ? process.argv[proofIdx + 1] : null;
const WIDTH = 480;
// Thai art whose printed text is still wrong (docs/CARD_IMAGE_PROOFREAD.md): the Thai version of the
// game shows the English original for these until corrected art arrives.
const THAI_ART_WRONG = new Set([]);
const isImage = (f) => /\.(png|jpe?g|webp)$/i.test(f); // folders may also hold notes (.txt)

const jobs = [];
for (const kind of ['establishments', 'landmarks']) {
  for (const f of readdirSync(join(SRC, 'original', kind)).filter(isImage)) {
    jobs.push({ lang: 'en', id: basename(f).replace(/\.\w+$/, ''), file: join(SRC, 'original', kind, f) });
  }
  for (const f of readdirSync(join(SRC, 'thai_previews', kind)).filter(isImage)) {
    const id = basename(f).replace(/_TH\.\w+$/, '');
    if (THAI_ART_WRONG.has(id)) continue;
    jobs.push({ lang: 'th', id, file: join(SRC, 'thai_previews', kind, f) });
  }
}
// English originals stand in for the Thai art listed in THAI_ART_WRONG.
for (const j of jobs.filter((x) => x.lang === 'en' && THAI_ART_WRONG.has(x.id))) jobs.push({ ...j, lang: 'th' });
for (const lang of ['th', 'en']) mkdirSync(join(OUT, lang), { recursive: true });
if (proofDir) mkdirSync(proofDir, { recursive: true });

let bytes = 0;
for (const j of jobs) {
  const img = sharp(j.file).resize({ width: WIDTH, withoutEnlargement: true });
  const info = await img.clone().webp({ quality: 80 }).toFile(join(OUT, j.lang, `${j.id}.webp`));
  bytes += info.size;
  if (proofDir && j.lang === 'th') await img.clone().jpeg({ quality: 70 }).toFile(join(proofDir, `${j.id}.jpg`));
}
const count = (l) => readdirSync(join(OUT, l)).length;
console.log(`th=${count('th')} en=${count('en')} total=${(bytes / 1024 / 1024).toFixed(2)} MB`);
if (!existsSync(join(OUT, 'th', 'moving_company.webp'))) console.log('note: no Thai moving_company image');
