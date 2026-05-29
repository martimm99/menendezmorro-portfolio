/**
 * build-sitemap.js
 *
 * Generates public/sitemap.xml from content/projects.json and content/site.json.
 * Includes the Home page (/), the Contact page (/contact), and one URL per
 * project (/<slug>). See BUILD_SPEC.md §10 (SEO baseline) for context.
 *
 * Full implementation lands in Phase 12 (SEO, sitemap, structured data, redirects).
 */

import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const projectsPath = resolve(projectRoot, 'content/projects.json');
const sitePath = resolve(projectRoot, 'content/site.json');

if (!existsSync(projectsPath) || !existsSync(sitePath)) {
  console.log('build-sitemap: content files not present yet (Phase 2 will add them). Skipping.');
  process.exit(0);
}

console.log('build-sitemap: sitemap generation is not implemented yet. It will be added in Phase 12.');
process.exit(0);
