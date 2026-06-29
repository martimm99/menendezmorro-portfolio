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
 *   4. Read content/site.json + content/projects.json and substitute
 *      {{tokens}} in each HTML file as it lands in public/. Tokens
 *      supported: siteTitle, siteDescription, siteUrl, ogImage,
 *      siteDataScript. The last one is a literal <script> tag that
 *      writes the full data object onto window.__SITE_DATA__ before
 *      the deferred main.js module runs — so data.js can read it
 *      synchronously and the page renders before first paint. This
 *      matters for cross-document view transitions (Phase 10): the
 *      new page's snapshot is taken at first paint, and an empty
 *      snapshot makes the vertical sweep look like a featureless
 *      solid panel appearing and vanishing.
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
const PROJECTS_JSON = join(CONTENT, 'projects.json');

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

async function readProjectsConfig() {
  if (!existsSync(PROJECTS_JSON)) {
    throw new Error(`build: ${PROJECTS_JSON} not found (content is missing).`);
  }
  return JSON.parse(await readFile(PROJECTS_JSON, 'utf8'));
}

// Produce the inline <script> tag that exposes the full site data on
// window.__SITE_DATA__. JSON.stringify is escaped so that any literal
// '</script>' inside copy strings can't break out of the tag.
function buildSiteDataScript(site, projectsDoc) {
  const data = { projects: projectsDoc.projects, site };
  const json = JSON.stringify(data).replace(/<\/(script)/gi, '<\\/$1');
  return `<script>window.__SITE_DATA__=${json};</script>`;
}

async function listSourceHtml() {
  const htmlDir = join(SRC, 'html');
  if (!existsSync(htmlDir)) return [];
  const entries = await readdir(htmlDir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.html'))
    .map((e) => e.name);
}

async function cleanPublic(htmlFiles, projectSlugs) {
  await mkdir(PUBLIC, { recursive: true });
  for (const { to } of COPY_DIRS) {
    await rm(to, { recursive: true, force: true });
  }
  for (const name of htmlFiles) {
    await rm(join(PUBLIC, name), { force: true });
  }
  await rm(join(PUBLIC, 'contact'), { recursive: true, force: true });
  for (const slug of projectSlugs) {
    await rm(join(PUBLIC, slug), { recursive: true, force: true });
  }
}

async function copyDirs() {
  for (const { from, to } of COPY_DIRS) {
    if (!existsSync(from)) continue;
    await cp(from, to, { recursive: true });
  }
}

function substituteTokens(template, tokens) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (Object.prototype.hasOwnProperty.call(tokens, key)) {
      return String(tokens[key]);
    }
    console.warn(`build: unknown template token ${match} — leaving as-is.`);
    return match;
  });
}

async function buildHtml(files, tokens) {
  for (const name of files) {
    const src = join(SRC, 'html', name);
    const dst = join(PUBLIC, name);
    const template = await readFile(src, 'utf8');
    const output = substituteTokens(template, tokens);
    await writeFile(dst, output);
  }
}

// Generate a real HTML file at public/<slug>/index.html for each project
// and at public/contact/index.html for the contact page, so every URL
// is served directly without server-side redirect rules.
async function buildRoutedPages(projectSlugs, tokens) {
  const projectTemplate = await readFile(join(SRC, 'html', 'project.html'), 'utf8');
  const contactTemplate = await readFile(join(SRC, 'html', 'contact.html'), 'utf8');
  const projectOutput = substituteTokens(projectTemplate, tokens);
  const contactOutput = substituteTokens(contactTemplate, tokens);

  for (const slug of projectSlugs) {
    const dir = join(PUBLIC, slug);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'index.html'), projectOutput);
  }

  const contactDir = join(PUBLIC, 'contact');
  await mkdir(contactDir, { recursive: true });
  await writeFile(join(contactDir, 'index.html'), contactOutput);
}

async function main() {
  const site = await readSiteConfig();
  const projectsDoc = await readProjectsConfig();
  const htmlFiles = await listSourceHtml();
  const projectSlugs = projectsDoc.projects.map((p) => p.slug);
  await cleanPublic(htmlFiles, projectSlugs);
  await copyDirs();
  const tokens = { ...site, siteDataScript: buildSiteDataScript(site, projectsDoc) };
  await buildHtml(htmlFiles, tokens);
  await buildRoutedPages(projectSlugs, tokens);
  console.log(`build: ${htmlFiles.length} HTML template(s), ${projectSlugs.length} project page(s), contact page, ${COPY_DIRS.length} directories copied.`);
}

main().catch((err) => {
  console.error('build failed:', err);
  process.exit(1);
});
