/**
 * build-sitemap.js
 *
 * Generates public/sitemap.xml from content/projects.json and
 * content/site.json. Includes the Home page (/), the Contact page
 * (/contact), and one URL per project (/<slug>). See BUILD_SPEC.md
 * §10 (SEO baseline). Run after build.js so the publish tree exists.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const projectsPath = resolve(projectRoot, 'content/projects.json');
const sitePath = resolve(projectRoot, 'content/site.json');
const outputPath = resolve(projectRoot, 'public/sitemap.xml');

if (!existsSync(projectsPath) || !existsSync(sitePath)) {
  console.error('build-sitemap: content files not found. Restore content/projects.json and content/site.json.');
  process.exit(1);
}

const projects = JSON.parse(readFileSync(projectsPath, 'utf8')).projects;
const site = JSON.parse(readFileSync(sitePath, 'utf8'));
const baseUrl = String(site.siteUrl || '').replace(/\/$/, '');
if (!baseUrl) {
  console.error('build-sitemap: site.siteUrl is empty in content/site.json. Cannot build absolute URLs.');
  process.exit(1);
}

// XML-escape any chars that could break the document. Slugs and the
// site URL are constrained, but better not to assume.
function xmlEscape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const urls = [
  `${baseUrl}/`,
  `${baseUrl}/contact`,
  ...projects.map((p) => `${baseUrl}/${p.slug}`)
];

const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...urls.map((u) => `  <url><loc>${xmlEscape(u)}</loc></url>`),
  '</urlset>',
  ''
].join('\n');

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, xml);
console.log(`build-sitemap: wrote ${urls.length} URL(s) to public/sitemap.xml.`);
