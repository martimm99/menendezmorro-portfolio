/**
 * optimize-images.js
 *
 * Produces responsive WebP variants for every source image in
 * assets/media/<slug>/. Two variants per source live alongside it:
 *
 *   <name>-mobile.webp   max 768px wide
 *   <name>-desktop.webp  max 1920px wide
 *
 * Source files (.jpg/.jpeg/.png) stay in place — the <picture> element
 * on the live site uses them as the format fallback. See BUILD_SPEC.md §8
 * (file structure) and §9 (performance targets, 300 KB per-image budget).
 *
 * Behavior:
 *   - WebP quality 80, preserves aspect ratio, never upscales.
 *   - Mobile variant is skipped when source.width <= 768 (it would be
 *     byte-identical to the desktop variant — wasted file).
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

const VARIANTS = [
  { name: 'mobile', maxWidth: 768 },
  { name: 'desktop', maxWidth: 1920 }
];
const SOURCE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.webm']);
const BUDGET_BYTES = 300 * 1024;
const WEBP_QUALITY = 80;

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

  console.log(`  ${sourceRel} (${metadata.width}×${metadata.height}, ${formatKb(sourceStat.size)})`);

  const folder = dirname(sourcePath);
  const stem = basename(sourcePath, extname(sourcePath));
  const result = { ok: true, written: 0, sourceBytes: sourceStat.size, outputBytes: 0, oversize: [] };

  for (const variant of VARIANTS) {
    if (variant.name === 'mobile' && metadata.width <= 768) {
      console.log(`    → ${stem}-${variant.name}.webp — skipped (source ≤ ${variant.maxWidth}px wide)`);
      continue;
    }
    const outPath = join(folder, `${stem}-${variant.name}.webp`);

    if (!force && existsSync(outPath) && statSync(outPath).mtimeMs >= sourceStat.mtimeMs) {
      console.log(`    → ${basename(outPath)} — up-to-date`);
      continue;
    }

    try {
      const info = await sharp(sourcePath)
        .resize(variant.maxWidth, null, { withoutEnlargement: true, fit: 'inside' })
        .webp({ quality: WEBP_QUALITY })
        .toFile(outPath);
      const outBytes = info.size ?? statSync(outPath).size;
      result.written += 1;
      result.outputBytes += outBytes;
      const overBudget = outBytes > BUDGET_BYTES;
      if (overBudget) {
        result.oversize.push({ path: outPath, bytes: outBytes });
        result.ok = false;
      }
      console.log(
        `    → ${basename(outPath)}  ${info.width}×${info.height}  ${formatKb(outBytes)}  ${percentDelta(sourceStat.size, outBytes)}${overBudget ? '  !! > 300 KB' : ''}`
      );
    } catch (err) {
      result.ok = false;
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
  let hadError = false;
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
      if (!result.ok) hadError = true;
      oversize.push(...result.oversize);
    }

    if (!touched) console.log('  (no source images)');
  }

  console.log('');
  console.log(`optimize-images: processed ${totalSources} source(s), wrote ${totalWritten} variant(s).`);
  if (totalWritten > 0) {
    const savedBytes = totalSourceBytes * VARIANTS.length - totalOutputBytes;
    const savedSign = savedBytes >= 0 ? 'saved' : 'added';
    console.log(`optimize-images: ${savedSign} ${formatKb(Math.abs(savedBytes))} versus encoding sources at every variant size.`);
  }

  if (oversize.length > 0) {
    console.error('');
    console.error(`optimize-images: ${oversize.length} variant(s) exceeded the 300 KB budget:`);
    for (const item of oversize) {
      console.error(`  ${relative(projectRoot, item.path)} — ${formatKb(item.bytes)}`);
    }
  }

  if (hadError) process.exit(1);
}

main().catch((err) => {
  console.error('optimize-images failed:', err);
  process.exit(1);
});
