/**
 * cleanup-media.js
 *
 * Deletes any image/video files in assets/media/ that are not referenced
 * by any project in content/projects.json. Run automatically by the
 * GitHub Action .github/workflows/cleanup-media.yml on every push that
 * changes projects.json.
 *
 * Exit codes:
 *   0  completed (possibly with deletions)
 *   1  could not read projects.json or assets/media/
 */

import { readFileSync, readdirSync, rmSync } from 'node:fs';
import { resolve, relative, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(import.meta.url), '../..');
const mediaRoot   = resolve(projectRoot, 'assets/media');
const projectsPath = resolve(projectRoot, 'content/projects.json');

const MEDIA_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.mp4', '.mov', '.webm']);

function collectRefs(data) {
  const refs = new Set();
  for (const project of data.projects) {
    if (project.cover) refs.add(normalize(project.cover.replace(/^\//, '')));
    for (const item of (project.media || [])) {
      if (item.src) refs.add(normalize(item.src.replace(/^\//, '')));
    }
  }
  return refs;
}

function scanFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...scanFiles(full));
    } else if (entry.isFile() && MEDIA_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
      files.push(full);
    }
  }
  return files;
}

let data;
try {
  data = JSON.parse(readFileSync(projectsPath, 'utf8'));
} catch (err) {
  console.error(`cleanup-media: could not read projects.json — ${err.message}`);
  process.exit(1);
}

const refs = collectRefs(data);
let allFiles;
try {
  allFiles = scanFiles(mediaRoot);
} catch (err) {
  console.error(`cleanup-media: could not scan assets/media/ — ${err.message}`);
  process.exit(1);
}

let deleted = 0;
for (const file of allFiles) {
  const rel = normalize(relative(projectRoot, file));
  if (!refs.has(rel)) {
    rmSync(file);
    console.log(`  deleted: ${rel}`);
    deleted++;
  }
}

if (deleted === 0) {
  console.log('cleanup-media: nothing to delete.');
} else {
  console.log(`cleanup-media: deleted ${deleted} orphaned file(s).`);
}
