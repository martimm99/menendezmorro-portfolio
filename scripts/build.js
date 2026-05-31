/**
 * build.js
 *
 * Assembles the publish tree at public/ from the authoring tree under src/,
 * assets/, and content/. Run by `npm run build` locally and by Netlify on
 * every deploy (see netlify.toml).
 *
 * Steps:
 *   1. Discover authoring HTML files in src/html/.
 *   2. Clean the build outputs in public/ (preserving static placeholders
 *      like 404.html, admin/, robots.txt, _redirects, sitemap.xml).
 *   3. Copy src/css, src/js, assets/, content/ into public/.
 *   4. Read content/site.json and substitute {{tokens}} in each HTML file
 *      as it lands in public/. Tokens currently supported: siteTitle,
 *      siteDescription, siteUrl, ogImage.
 *
 * Build outputs (everything below is recreated each run):
 *   public/css/         from src/css/
 *   public/js/          from src/js/
 *   public/assets/      from assets/
 *   public/content/     from content/
 *   public/<name>.html  from src/html/<name>.html (with token substitution)
 *
 * Build inputs that survive untouched:
 *   public/404.html, public/_redirects, public/robots.txt, public/admin/
 *   public/sitemap.xml (produced separately by build-sitemap.js in Phase 12)
 */

import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(projectRoot, 'public');
const SRC = join(projectRoot, 'src');
const ASSETS = join(projectRoot, 'assets');
const CONTENT = join(projectRoot, 'content');
const SITE_JSON = join(CONTENT, 'site.json');

const COPY_DIRS = [
  { from: join(SRC, 'css'),   to: join(PUBLIC, 'css') },
  { from: join(SRC, 'js'),    to: join(PUBLIC, 'js') },
  { from: ASSETS,             to: join(PUBLIC, 'assets') },
  { from: CONTENT,            to: join(PUBLIC, 'content') }
];

async function readSiteConfig() {
  if (!existsSync(SITE_JSON)) {
    throw new Error(`build: ${SITE_JSON} not found (content is missing).`);
  }
  return JSON.parse(await readFile(SITE_JSON, 'utf8'));
}

async function listSourceHtml() {
  const htmlDir = join(SRC, 'html');
  if (!existsSync(htmlDir)) return [];
  const entries = await readdir(htmlDir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.html'))
    .map((e) => e.name);
}

async function cleanPublic(htmlFiles) {
  await mkdir(PUBLIC, { recursive: true });
  for (const { to } of COPY_DIRS) {
    await rm(to, { recursive: true, force: true });
  }
  for (const name of htmlFiles) {
    await rm(join(PUBLIC, name), { force: true });
  }
}

async function copyDirs() {
  for (const { from, to } of COPY_DIRS) {
    if (!existsSync(from)) continue;
    await cp(from, to, { recursive: true });
  }
}

function substituteTokens(template, site) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (Object.prototype.hasOwnProperty.call(site, key)) {
      return String(site[key]);
    }
    console.warn(`build: unknown template token ${match} — leaving as-is.`);
    return match;
  });
}

async function buildHtml(files, site) {
  for (const name of files) {
    const src = join(SRC, 'html', name);
    const dst = join(PUBLIC, name);
    const template = await readFile(src, 'utf8');
    const output = substituteTokens(template, site);
    await writeFile(dst, output);
  }
}

async function main() {
  const site = await readSiteConfig();
  const htmlFiles = await listSourceHtml();
  await cleanPublic(htmlFiles);
  await copyDirs();
  await buildHtml(htmlFiles, site);
  console.log(`build: ${htmlFiles.length} HTML file(s), ${COPY_DIRS.length} directories copied.`);
}

main().catch((err) => {
  console.error('build failed:', err);
  process.exit(1);
});
