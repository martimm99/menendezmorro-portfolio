/**
 * optimize-images.js
 *
 * Generates responsive image variants from source files in assets/media/.
 * For each source image under assets/media/<project-slug>/, this script
 * produces a `-mobile.webp` (≤ 768px wide) and a `-desktop.webp`
 * (> 768px wide) sibling, per BUILD_SPEC.md §9 (performance targets) and
 * the file structure described in §8.
 *
 * The script is idempotent: running it twice over the same source set
 * produces no extra work. The owner runs this once after adding new media:
 *   npm run optimize-images
 *
 * Full implementation lands in Phase 3 (image optimization pipeline).
 */

import { existsSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mediaRoot = resolve(projectRoot, 'assets/media');

if (!existsSync(mediaRoot)) {
  console.log('optimize-images: assets/media/ does not exist. Nothing to optimize.');
  process.exit(0);
}

const projectDirs = readdirSync(mediaRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

if (projectDirs.length === 0) {
  console.log('optimize-images: assets/media/ contains no project folders yet (Phase 3 will populate them and wire up sharp).');
  process.exit(0);
}

console.log(`optimize-images: found ${projectDirs.length} project folder(s); pipeline arrives in Phase 3.`);
process.exit(0);
