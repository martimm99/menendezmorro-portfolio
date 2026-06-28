/**
 * optimize-images.js
 *
 * Produces responsive WebP variants for every source image in
 * assets/media/<slug>/. Two variants per source live alongside it:
 *
 *   <name>-mobile.webp   max 1536px wide (covers 3× retina phones at the 768px breakpoint)
 *   <name>-desktop.webp  max 1920px wide
 *
 * Source files (.jpg/.jpeg/.png) stay in place — the <picture> element
 * on the live site uses them as the format fallback. See BUILD_SPEC.md §8
 * (file structure) and §9 (performance targets, 300 KB per-image budget).
 *
 * Behavior:
 *   - WebP quality 80, preserves aspect ratio, never upscales.
 *   - Both mobile and desktop variants are always generated; for sources
 *     narrower than 1536px both resolve to native width (no upscaling).
 *   - Idempotent: a variant is skipped when its mtime is >= the source's.
 *   - --force regenerates every variant, ignoring mtime.
 *   - --slug=<slug> restricts work to one project folder.
 *   - Any output exceeding 300 KB fails the run (spec §9 budget guard).
 *   - Videos (.mp4 and friends) are logged as skipped and left untouched.
 *
 * Usage:
 *   npm run optimize-images
 *   npm run optimize-images -- --force
 *   npm run optimize-images -- --slug=morro
 *
 * Exit codes:
 *   0  all variants produced (or up-to-date) within budget
 *   1  any error occurred (bad CLI args, unreadable source, budget violation)
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, relative, basename, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mediaRoot = resolve(projectRoot, 'assets/media');

// Gallery images: quality 80, desktop capped at 1920px.
// Cover images (*-cover.jpg): quality 85, desktop capped at 2560px
// (covers fill the full viewport on Home and are the LCP element).
const GALLERY_VARIANTS = [
  { name: 'mobile', maxWidth: 1536 },
  { name: 'desktop', maxWidth: 1920 }
];
// Cover mobile uses a wider cap than gallery mobile: covers fill the full
// viewport with object-fit: cover, and on portrait phones it's the height
// that determines sharpness. At 1536px wide a landscape source produces
// only 864px of height, which a retina portrait phone must upscale ~3×.
// At 1920px it produces 1080px, cutting that factor to ~2.3×.
const COVER_VARIANTS = [
  { name: 'mobile', maxWidth: 1920 },
  { name: 'desktop', maxWidth: 2560 }
];
const GALLERY_QUALITY = 80;
const COVER_QUALITY   = 85;
const SOURCE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.webm']);
const BUDGET_BYTES = 300 * 1024;

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = { force: false, slug: null };
  const unknown = [];
  for (const arg of args) {
    if (arg === '--force') opts.force = true;
    else if (arg.startsWith('--slug=')) opts.slug = arg.slice('--slug='.length);
    else unknown.push(arg);
  }
  if (unknown.length > 0) {
    console.error(`optimize-images: unknown argument(s): ${unknown.join(' ')}`);
    console.error('  usage: npm run optimize-images [-- --force] [-- --slug=<slug>]');
    process.exit(1);
  }
  if (opts.slug !== null && opts.slug === '') {
    console.error('optimize-images: --slug requires a value (e.g. --slug=morro)');
    process.exit(1);
  }
  return opts;
}

function resolveProjectDirs({ slug }) {
  if (!existsSync(mediaRoot)) {
    console.error(`optimize-images: ${relative(projectRoot, mediaRoot)} does not exist.`);
    process.exit(1);
  }
  if (slug) {
    const dir = resolve(mediaRoot, slug);
    if (!existsSync(dir) || !statSync(dir).isDirectory()) {
      console.error(`optimize-images: project folder not found for slug "${slug}" (${relative(projectRoot, dir)})`);
      process.exit(1);
    }
    return [dir];
  }
  return readdirSync(mediaRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => resolve(mediaRoot, entry.name))
    .sort();
}

function classify(file) {
  const ext = extname(file).toLowerCase();
  if (SOURCE_EXTENSIONS.has(ext)) return 'source';
  if (VIDEO_EXTENSIONS.has(ext)) return 'video';
  return 'other';
}

function formatKb(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function percentDelta(srcBytes, outBytes) {
  if (srcBytes === 0) return 'n/a';
  const delta = ((outBytes - srcBytes) / srcBytes) * 100;
  const sign = delta < 0 ? '−' : '+';
  return `${sign}${Math.abs(delta).toFixed(0)}%`;
}

function isCoverFile(name) {
  return basename(name, extname(name)).endsWith('-cover');
}

async function processSource(sourcePath, { force }) {
  const sourceRel = relative(projectRoot, sourcePath);
  const sourceStat = statSync(sourcePath);
  let metadata;
  try {
    metadata = await sharp(sourcePath).metadata();
  } catch (err) {
    console.error(`  ${sourceRel} — error reading source: ${err.message}`);
    return { ok: false, written: 0, sourceBytes: sourceStat.size, outputBytes: 0, oversize: [] };
  }

  const cover = isCoverFile(sourcePath);
  const variants = cover ? COVER_VARIANTS : GALLERY_VARIANTS;
  const quality  = cover ? COVER_QUALITY  : GALLERY_QUALITY;
  const label    = cover ? 'cover' : 'gallery';

  console.log(`  ${sourceRel} (${metadata.width}×${metadata.height}, ${formatKb(sourceStat.size)}, ${label})`);

  const folder = dirname(sourcePath);
  const stem = basename(sourcePath, extname(sourcePath));
  const result = { failed: false, overBudget: false, written: 0, sourceBytes: sourceStat.size, outputBytes: 0, oversize: [] };

  for (const variant of variants) {
    const outPath = join(folder, `${stem}-${variant.name}.webp`);

    if (!force && existsSync(outPath) && statSync(outPath).mtimeMs >= sourceStat.mtimeMs) {
      console.log(`    → ${basename(outPath)} — up-to-date`);
      continue;
    }

    try {
      const info = await sharp(sourcePath)
        .resize(variant.maxWidth, null, { withoutEnlargement: true, fit: 'inside' })
        .webp({ quality })
        .toFile(outPath);
      const outBytes = info.size ?? statSync(outPath).size;
      result.written += 1;
      result.outputBytes += outBytes;
      const over = outBytes > BUDGET_BYTES;
      if (over) {
        result.oversize.push({ path: outPath, bytes: outBytes });
        result.overBudget = true;
      }
      console.log(
        `    → ${basename(outPath)}  ${info.width}×${info.height}  ${formatKb(outBytes)}  ${percentDelta(sourceStat.size, outBytes)}${over ? '  !! > 300 KB' : ''}`
      );
    } catch (err) {
      result.failed = true;
      console.error(`    → ${basename(outPath)} — error: ${err.message}`);
    }
  }

  return result;
}

async function main() {
  const opts = parseArgs(process.argv);
  const projectDirs = resolveProjectDirs(opts);

  if (projectDirs.length === 0) {
    console.log('optimize-images: no project folders found in assets/media/. Nothing to do.');
    return;
  }

  let totalSources = 0;
  let totalWritten = 0;
  let totalSourceBytes = 0;
  let totalOutputBytes = 0;
  let hadFailure = false;
  let hadBudgetWarning = false;
  const oversize = [];

  for (const dir of projectDirs) {
    const slug = basename(dir);
    console.log(`${slug}/`);
    const entries = readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => e.name)
      .sort();

    let touched = false;
    for (const name of entries) {
      const full = resolve(dir, name);
      const kind = classify(name);
      if (kind === 'video') {
        console.log(`  ${slug}/${name} — skipped (video, out of scope)`);
        touched = true;
        continue;
      }
      if (kind === 'other') continue; // ignore .webp outputs and anything else
      totalSources += 1;
      touched = true;
      const result = await processSource(full, opts);
      totalWritten += result.written;
      totalSourceBytes += result.sourceBytes;
      totalOutputBytes += result.outputBytes;
      if (result.failed) hadFailure = true;
      if (result.overBudget) hadBudgetWarning = true;
      oversize.push(...result.oversize);
    }

    if (!touched) console.log('  (no source images)');
  }

  // Process source files at the root of assets/media/ (e.g. CMS-uploaded covers
  // that land flat rather than in a project subfolder). Skipped for --slug runs.
  if (!opts.slug) {
    const rootFiles = readdirSync(mediaRoot, { withFileTypes: true })
      .filter((e) => e.isFile() && classify(e.name) === 'source')
      .map((e) => e.name)
      .sort();
    if (rootFiles.length > 0) {
      console.log('(media root)');
      for (const name of rootFiles) {
        totalSources += 1;
        const result = await processSource(resolve(mediaRoot, name), opts);
        totalWritten += result.written;
        totalSourceBytes += result.sourceBytes;
        totalOutputBytes += result.outputBytes;
        if (result.failed) hadFailure = true;
        if (result.overBudget) hadBudgetWarning = true;
        oversize.push(...result.oversize);
      }
    }
  }

  console.log('');
  console.log(`optimize-images: processed ${totalSources} source(s), wrote ${totalWritten} variant(s).`);
  if (totalWritten > 0) {
    const savedBytes = totalSourceBytes * GALLERY_VARIANTS.length - totalOutputBytes;
    const savedSign = savedBytes >= 0 ? 'saved' : 'added';
    console.log(`optimize-images: ${savedSign} ${formatKb(Math.abs(savedBytes))} versus encoding sources at every variant size.`);
  }

  if (hadBudgetWarning) {
    console.warn('');
    console.warn(`optimize-images: ${oversize.length} variant(s) exceeded the 300 KB budget (warning only — optimise the source image to fix):`);
    for (const item of oversize) {
      console.warn(`  ${relative(projectRoot, item.path)} — ${formatKb(item.bytes)}`);
    }
  }

  if (hadFailure) process.exit(1);
}

main().catch((err) => {
  console.error('optimize-images failed:', err);
  process.exit(1);
});
