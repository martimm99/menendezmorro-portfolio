/**
 * build.js
 *
 * Assembles the publish tree at public/ from the authoring tree under src/,
 * assets/, and content/. Run by `npm run build` locally and by GitHub Actions
 * on every push to main (see .github/workflows/deploy-pages.yml).
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
 *   public/404.html, public/robots.txt, public/admin/
 *   public/sitemap.xml (produced separately by build-sitemap.js)
 */

import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(projectRoot, 'public');
const SRC = join(projectRoot, 'src');
const ASSETS = join(projectRoot, 'assets');
const CONTENT = join(projectRoot, 'content');
const SITE_JSON = join(CONTENT, 'site.json');
const PROJECTS_JSON = join(CONTENT, 'projects.json');
const HANGMAN_DIR = join(ASSETS, 'icons', 'hangman');
const HANGMAN_STAGES = ['structure', 'head', 'body', 'arm-left', 'arm-right', 'leg-left', 'leg-right'];
// Fields kept OUT of window.__SITE_DATA__ for a protected project — the real
// gallery/description/links. Written instead to a separate static JSON file
// (public/assets/protected/<slug>.json), fetched only after the password
// gate passes. See password-gate.js and BUILD_SPEC.md §5.5.
const GATED_FIELDS = ['media', 'longDescription', 'links'];

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

// Produce the inline <script> tag that exposes the site data on
// window.__SITE_DATA__ — shared across every page. `projects` is the
// already-sanitised public list (see splitProtectedContent): a protected
// project's real content is never in here, on any page, including its own.
// JSON.stringify is escaped so that any literal '</script>' inside copy
// strings can't break out of the tag.
function buildSiteDataScript(site, projects) {
  const data = { projects, site };
  const json = JSON.stringify(data).replace(/<\/(script)/gi, '<\\/$1');
  return `<script>window.__SITE_DATA__=${json};</script>`;
}

/* ---------- Password-protected projects ----------
 *
 * A protected project's real content (gallery, long description, links)
 * never enters window.__SITE_DATA__ — not even on that project's own page.
 * It's written to its own static JSON file instead, fetched by
 * password-gate.js only once the visitor has typed the correct password.
 * Everything client-side needs to RUN the gate (field count, and a
 * per-character-position hash to validate each keystroke live) is derived
 * here at build time from the plaintext; the plaintext itself never leaves
 * this Node process. This is a soft gate, not real access control — see
 * BUILD_SPEC.md §5.5 for what that does and doesn't mean. */

function hashPositionalChar(index, char) {
  return createHash('sha256').update(`${index}:${char.toUpperCase()}`).digest('hex');
}

// Pre-paint <html> background for a protected project's page (see
// buildRoutedPages) — must match src/css/tokens.css's --color-accent /
// --color-bg-light exactly, since this is what paints before any
// stylesheet has loaded. Kept as a named constant (not inlined) so that
// requirement is visible at the one place it's set, rather than a bare
// hex literal; there's no build-time access to the CSS custom property
// itself, so keeping the two in sync when the token changes is manual.
const PROTECTED_BG_COLOR = '#0055ff'; // --color-accent
const UNPROTECTED_BG_COLOR = '#fff'; // --color-bg-light

// Splits the full project list into what's safe to inline everywhere
// (publicProjects) and, per protected project, the gated payload that gets
// written to its own file instead.
function splitProtectedContent(projects) {
  const publicProjects = [];
  const protectedPayloads = [];
  for (const project of projects) {
    if (!project.protected) {
      publicProjects.push(project);
      continue;
    }
    const password = String(project.password || '');
    const publicProject = { ...project };
    const gated = {};
    for (const field of GATED_FIELDS) {
      gated[field] = project[field];
      delete publicProject[field];
    }
    delete publicProject.password;
    publicProject.passwordCharHashes = Array.from(password).map((ch, i) => hashPositionalChar(i, ch));
    publicProjects.push(publicProject);
    protectedPayloads.push({ slug: project.slug, data: gated });
  }
  return { publicProjects, protectedPayloads };
}

async function writeProtectedPayloads(payloads) {
  if (payloads.length === 0) return;
  const dir = join(PUBLIC, 'assets', 'protected');
  await mkdir(dir, { recursive: true });
  // Each write targets its own file — independent, so they run concurrently
  // rather than one at a time. No <script>-tag escaping needed here: unlike
  // buildSiteDataScript/buildWebsiteStructuredData, this JSON is served as
  // its own file and only ever reaches the browser via fetch()+res.json(),
  // never inlined into an HTML <script> element.
  await Promise.all(payloads.map(({ slug, data }) =>
    writeFile(join(dir, `${slug}.json`), JSON.stringify(data))
  ));
}

// Pulls the inner markup out of a designer-exported <svg>...</svg> file
// (viewBox/xmlns wrapper discarded — the shared wrapper built below
// supplies those) so each stage file can just be normal, standalone SVG.
function extractSvgInner(raw) {
  const match = raw.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
  return (match ? match[1] : raw).trim();
}

// Each stage file is independent artwork (Martí's own viewBox, own local
// coordinate space, not pre-aligned to the others) — these offsets compose
// them into one figure hanging from the gallows' hook. Exact values, not
// estimated: Martí supplied a reference SVG with the whole figure already
// composed (assets/icons/hangman/full-composition-reference.svg — kept
// for future re-tuning), and each offset here is that reference path's
// own M-coordinate minus the same stage file's own M-coordinate — i.e.
// precisely how far each standalone piece needs to move to land where it
// does in the reference. If the art is ever redrawn with a different
// local origin per piece, re-derive the same way against a fresh
// reference rather than eyeballing it. Written onto each stage as the
// --hx/--hy custom properties password-gate.css positions it with — in
// the same `transform` as the reveal animation's scale, not a separate
// wrapper element, because a CSS `transform` on an SVG element overrides
// its own `transform` attribute rather than composing with it.
const HANGMAN_OFFSETS = {
  'head':      [50.81, 18.96],
  'body':      [60.34, 35.46],
  'arm-left':  [43.82, 38.45],
  'arm-right': [61.06, 39.64],
  'leg-left':  [45.33, 65.17],
  'leg-right': [63.32, 65.92]
};

// One combined inline sprite for all 7 hangman stages, inlined directly
// into the built HTML of whichever protected project pages need it —
// never a separate file per stage, never a network request at all. Each
// stage's shapes are solid fills with no hardcoded color, so the sprite's
// own color (set in password-gate.css via fill="currentColor" here)
// applies uniformly. Non-structure stages start invisible via CSS alone
// (see .hangman-stage in password-gate.css) — password-gate.js reveals
// one by adding .is-revealed, which is what plays the pop-in transition.
// Missing files degrade gracefully — a warning, and that stage just never
// appears — rather than failing the build.
//
// The sprite's markup depends only on the stage files + HANGMAN_OFFSETS,
// never on which project is asking — memoized so N protected projects
// read+parse the 7 SVGs once between them, not N times. The 7 reads
// themselves are independent, so they run concurrently.
let hangmanSpritePromise = null;

function buildHangmanSprite() {
  if (!hangmanSpritePromise) {
    hangmanSpritePromise = Promise.all(HANGMAN_STAGES.map(async (stage) => {
      const file = join(HANGMAN_DIR, `${stage}.svg`);
      if (!existsSync(file)) {
        console.warn(`build: assets/icons/hangman/${stage}.svg not found — password gate hangman will be incomplete.`);
        return '';
      }
      const raw = await readFile(file, 'utf8');
      const offset = HANGMAN_OFFSETS[stage];
      const styleAttr = offset ? ` style="--hx:${offset[0]}px;--hy:${offset[1]}px"` : '';
      return `<g class="hangman-stage" data-stage="${stage}"${styleAttr}>${extractSvgInner(raw)}</g>`;
    })).then((groups) =>
      // Matches the reference composition's own viewBox exactly.
      `<svg class="hangman-illustration" viewBox="0 0 87.68 119.79" fill="currentColor" aria-hidden="true" focusable="false">${groups.join('')}</svg>`
    );
  }
  return hangmanSpritePromise;
}

// The gate's full static markup for one protected project — visible the
// instant the page paints, no JS required to look correct (only to become
// interactive). Field count matches the real password length; the hangman
// sprite is shared. password-gate.js attaches all behaviour to this
// already-rendered markup after a dynamic import.
async function buildPasswordGateBlock(project) {
  const password = String(project.password || '');
  // Pre-rendered as all-blank (empty, with the blank line drawn by CSS —
  // see .password-field-slot's border-bottom) — the correct static
  // starting state, no JS needed to reach it. password-gate.js only ever
  // rewrites a slot's own textContent, never the count of slots.
  const fields = Array.from(password).map(() => '<span class="password-field-slot"></span>').join('');
  const hangmanSprite = await buildHangmanSprite();
  return `<div class="password-gate" data-password-gate>
      <div class="password-gate-row">
        <label class="password-gate-fields" data-password-fields>
          ${fields}
          <input type="text" class="password-gate-input" data-password-input autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" inputmode="text" maxlength="${password.length}" aria-label="Enter password">
        </label>
        <div class="password-gate-hangman" data-hangman>${hangmanSprite}</div>
        <p class="password-gate-status" data-password-status>Password protected</p>
      </div>
    </div>`;
}

function buildAnalyticsScript(site) {
  const id = site.analytics?.googleAnalyticsId;
  if (!id) return '';
  // Stub sets up the gtag queue immediately so early calls are not lost.
  // The actual gtag.js is loaded lazily during browser idle time so it never
  // blocks the main thread during page transitions (traced at ~22ms).
  return `<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${id}');(function(){function l(){var s=document.createElement('script');s.async=1;s.src='https://www.googletagmanager.com/gtag/js?id=${id}';document.head.appendChild(s);}window.requestIdleCallback?requestIdleCallback(l):setTimeout(l,2000);})();</script>`;
}

function buildWebsiteStructuredData(site) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: site.siteTitle,
    url: `${site.siteUrl}/`,
    description: site.siteDescription,
  };
  const json = JSON.stringify(data).replace(/<\/(script)/gi, '<\\/$1');
  return `<script type="application/ld+json">${json}</script>`;
}

async function listSourceHtml() {
  const htmlDir = join(SRC, 'html');
  if (!existsSync(htmlDir)) return [];
  const entries = await readdir(htmlDir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.html'))
    .map((e) => e.name);
}

// Everything else directly under public/ is generated by this file and
// gets wiped and rebuilt from scratch every run — see the module comment.
// Deliberately a "what to keep" allowlist rather than a "what to remove"
// list of known slugs/templates: a project that's renamed or deleted from
// content/projects.json is no longer in that list, so the old, now-
// nameless removal loop this replaced would just leave its stale
// public/<old-slug>/ page sitting there forever instead of it actually
// disappearing on the next build.
//
// This list must match the un-ignored entries in .gitignore's own
// public/* allowlist — the two can't share one source (JS vs. git
// config), so if one changes, update the other too.
const STATIC_PUBLIC_ENTRIES = new Set(['404.html', 'CNAME', '_redirects', 'robots.txt', 'admin']);

async function cleanPublic() {
  await mkdir(PUBLIC, { recursive: true });
  for (const entry of await readdir(PUBLIC)) {
    if (STATIC_PUBLIC_ENTRIES.has(entry)) continue;
    await rm(join(PUBLIC, entry), { recursive: true, force: true });
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
// Each project page gets its own canonical URL and meta tags baked in,
// so search engines see correct per-project metadata even before JS runs.
//
// `projects` here is the FULL (un-sanitised) list — buildPasswordGateBlock
// needs the plaintext password to compute per-character hashes and the
// field count. That plaintext only ever exists inside this Node process;
// it does not reach any of the written output.
async function buildRoutedPages(projects, tokens) {
  const projectTemplate = await readFile(join(SRC, 'html', 'project.html'), 'utf8');
  const contactTemplate = await readFile(join(SRC, 'html', 'contact.html'), 'utf8');
  const contactOutput = substituteTokens(contactTemplate, tokens);

  // Each project's page is independent of every other's — same template,
  // own output file, no shared mutable state — so they build concurrently
  // rather than one at a time.
  await Promise.all(projects.map(async (project) => {
    const pageTitle = `${project.title} — ${tokens.siteTitle}`;
    const pageDescription = project.description || tokens.siteDescription;
    const pageUrl = `${tokens.siteUrl}/${project.slug}`;
    const coverIsImage = project.cover && !/\.(mp4|webm|mov|ogg)$/i.test(project.cover);
    const pageOgImage = coverIsImage
      ? `${tokens.siteUrl}/${project.cover.replace(/^\//, '')}`
      : `${tokens.siteUrl}/${tokens.ogImage}`;
    const isProtected = !!project.protected;
    const projectTokens = {
      ...tokens,
      pageTitle, pageDescription, pageUrl, pageOgImage,
      // Empty strings (or the normal white) for an ordinary project — zero
      // added markup, zero extra request. Only a protected project's own
      // built page carries these. projectBgColor matches password-gate.css's
      // background exactly (PROTECTED_BG_COLOR === --color-accent), so the
      // very first paint (before any stylesheet has a chance to load) is
      // already correct — no white-then-blue flash.
      projectBodyClass:  isProtected ? ' is-password-protected' : '',
      projectBgColor:    isProtected ? PROTECTED_BG_COLOR : UNPROTECTED_BG_COLOR,
      passwordGateStyles: isProtected ? '<link rel="stylesheet" href="/css/password-gate.css">' : '',
      passwordGateBlock: isProtected ? await buildPasswordGateBlock(project) : ''
    };
    const output = substituteTokens(projectTemplate, projectTokens);
    const dir = join(PUBLIC, project.slug);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'index.html'), output);
  }));

  const contactDir = join(PUBLIC, 'contact');
  await mkdir(contactDir, { recursive: true });
  await writeFile(join(contactDir, 'index.html'), contactOutput);
}

async function main() {
  const site = await readSiteConfig();
  const projectsDoc = await readProjectsConfig();
  const allHtmlFiles = await listSourceHtml();
  // project.html is rendered per-slug by buildRoutedPages; exclude from top-level output
  const htmlFiles = allHtmlFiles.filter((f) => f !== 'project.html');
  const projectSlugs = projectsDoc.projects.map((p) => p.slug);
  await cleanPublic();
  await copyDirs();

  const { publicProjects, protectedPayloads } = splitProtectedContent(projectsDoc.projects);
  await writeProtectedPayloads(protectedPayloads);

  const tokens = {
    ...site,
    siteDataScript: buildSiteDataScript(site, publicProjects),
    analyticsScript: buildAnalyticsScript(site),
    websiteStructuredData: buildWebsiteStructuredData(site),
  };
  await buildHtml(htmlFiles, tokens);
  await buildRoutedPages(projectsDoc.projects, tokens);
  const protectedNote = protectedPayloads.length > 0 ? `, ${protectedPayloads.length} password-protected` : '';
  console.log(`build: ${htmlFiles.length} HTML template(s), ${projectSlugs.length} project page(s)${protectedNote}, contact page, ${COPY_DIRS.length} directories copied.`);
}

main().catch((err) => {
  console.error('build failed:', err);
  process.exit(1);
});
