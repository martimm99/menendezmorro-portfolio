/**
 * generate-placeholders.js
 *
 * Generates placeholder JPEG media for every project in content/projects.json.
 * Used during Phase 2 to bootstrap the site visually before the owner uploads
 * real photography and design assets via the CMS.
 *
 * See BUILD_SPEC.md Appendix D for the placeholder strategy. Per project,
 * four placeholders are produced under assets/media/<slug>/:
 *
 *   <slug>-1.jpg  1920×1080  landscape (cover)
 *   <slug>-2.jpg  1080×1920  vertical
 *   <slug>-3.jpg  1080×1080  square
 *   <slug>-4.jpg  2400×1000  wide
 *
 * Each image is a dark canvas (#1a1a1a) with the project title centered in
 * light gray (#aaaaaa), and an "N / 4" index below the title. The script is
 * idempotent and safe to re-run when new projects are added without final
 * media.
 *
 * Usage:
 *   npm run generate-placeholders
 */

import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const projectsPath = resolve(projectRoot, 'content/projects.json');
const mediaRoot = resolve(projectRoot, 'assets/media');

const BG = '#1a1a1a';
const FG = '#aaaaaa';
const TOTAL = 4;

const VARIANTS = [
  { index: 1, width: 1920, height: 1080 },
  { index: 2, width: 1080, height: 1920 },
  { index: 3, width: 1080, height: 1080 },
  { index: 4, width: 2400, height: 1000 }
];

function escapeXml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildSvg({ title, index, width, height }) {
  const minSide = Math.min(width, height);
  const titleSize = Math.round(minSide * 0.07);
  const indexSize = Math.round(minSide * 0.035);
  const gap = Math.round(minSide * 0.06);
  const titleY = Math.round(height / 2);
  const indexY = titleY + gap;
  const safeTitle = escapeXml(title);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <style>
    .title { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; font-weight: 500; }
    .index { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; font-weight: 400; }
  </style>
  <text class="title" x="50%" y="${titleY}" fill="${FG}" font-size="${titleSize}" text-anchor="middle" dominant-baseline="middle">${safeTitle}</text>
  <text class="index" x="50%" y="${indexY}" fill="${FG}" font-size="${indexSize}" text-anchor="middle" dominant-baseline="hanging">${index} / ${TOTAL}</text>
</svg>`;
}

async function generateOne({ slug, title }, variant) {
  const dir = resolve(mediaRoot, slug);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const filePath = resolve(dir, `${slug}-${variant.index}.jpg`);
  const svg = Buffer.from(buildSvg({ title, index: variant.index, width: variant.width, height: variant.height }));
  await sharp({
    create: {
      width: variant.width,
      height: variant.height,
      channels: 3,
      background: BG
    }
  })
    .composite([{ input: svg, top: 0, left: 0 }])
    .jpeg({ quality: 75, chromaSubsampling: '4:2:0', mozjpeg: true })
    .toFile(filePath);
  return filePath;
}

async function main() {
  if (!existsSync(projectsPath)) {
    console.error(`generate-placeholders: ${projectsPath} not found.`);
    process.exit(1);
  }

  const data = JSON.parse(readFileSync(projectsPath, 'utf8'));
  const projects = Array.isArray(data?.projects) ? data.projects : [];
  if (projects.length === 0) {
    console.log('generate-placeholders: no projects in content/projects.json. Nothing to generate.');
    return;
  }

  let totalBytes = 0;
  let count = 0;
  let oversized = 0;

  for (const project of projects) {
    if (!project.slug || !project.title) {
      console.warn(`  skip: project missing slug or title (${JSON.stringify(project).slice(0, 80)}...)`);
      continue;
    }
    process.stdout.write(`  ${project.slug}: `);
    for (const variant of VARIANTS) {
      const file = await generateOne(project, variant);
      const { size } = statSync(file);
      totalBytes += size;
      count += 1;
      if (size > 60 * 1024) oversized += 1;
      process.stdout.write(`${variant.index} `);
    }
    process.stdout.write('\n');
  }

  const kb = (totalBytes / 1024).toFixed(1);
  console.log(`generate-placeholders: wrote ${count} file(s), ${kb} KB total.`);
  if (oversized > 0) {
    console.error(`generate-placeholders: ${oversized} file(s) exceeded the 60 KB per-file target.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('generate-placeholders failed:', err);
  process.exit(1);
});
