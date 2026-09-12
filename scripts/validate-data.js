/**
 * validate-data.js
 *
 * Validates content/projects.json and content/site.json against JSON Schema
 * before a commit reaches production. Run locally via `npm run validate` and
 * automatically in CI on every push and pull request.
 *
 * See BUILD_SPEC.md §6 (data model) and §7 (CMS schema) for the authoritative
 * field list. The schemas below mirror those definitions verbatim.
 *
 * In addition to pure JSON Schema validation, the script performs cross-field
 * checks that JSON Schema cannot express cleanly:
 *
 *   - slugs are unique across all projects
 *   - video media items are warned (not failed) when they lack a poster
 *   - figma media items are warned when the url is not a "/proto/" link
 *
 * Exit codes:
 *   0  validation passed (possibly with warnings)
 *   1  validation failed
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const projectsPath = resolve(projectRoot, 'content/projects.json');
const sitePath = resolve(projectRoot, 'content/site.json');

const SLUG_PATTERN = '^[a-z0-9]+(-[a-z0-9]+)*$';

const projectsSchema = {
  $id: 'projects.json',
  type: 'object',
  additionalProperties: false,
  required: ['projects'],
  properties: {
    projects: {
      type: 'array',
      minItems: 1,
      items: { $ref: '#/$defs/project' }
    }
  },
  $defs: {
    project: {
      type: 'object',
      additionalProperties: false,
      required: [
        'slug', 'title', 'role', 'year', 'location', 'type',
        'subcategory', 'description', 'longDescription', 'links',
        'media'
      ],
      properties: {
        slug:            { type: 'string', pattern: SLUG_PATTERN },
        title:           { type: 'string', minLength: 1 },
        role:            { type: 'string', minLength: 1 },
        year:            { type: 'string', minLength: 1 },
        location:        { type: 'string' },
        type:            { enum: ['design', 'photo'] },
        subcategory:     { type: 'array', items: { type: 'string' } },
        description:     { type: 'string' },
        longDescription: { type: 'string' },
        links: {
          type: 'array',
          items: { $ref: '#/$defs/link' }
        },
        highlightColor: { type: 'string' },
        cover:     { type: 'string' },
        coverAlt:  { type: 'string' },
        media: {
          type: 'array',
          minItems: 0,
          items: { $ref: '#/$defs/media' }
        },
        // Password-protected projects. `password` is plain text here (this
        // file lives in the repo, never shipped to the browser as-is) —
        // scripts/build.js hashes it per character at build time and keeps
        // the plaintext out of window.__SITE_DATA__ entirely. See
        // BUILD_SPEC.md §5.5 and project_password_gate.md memory.
        protected: { type: 'boolean' },
        password:  { type: 'string' },
        // Excluded from the Home rotation and the sitemap, but its own
        // page at /<slug> is still built normally — for sharing a project
        // directly with specific people without featuring it. Unrelated
        // to `protected`: this is about discoverability, not access.
        hidden: { type: 'boolean' }
      }
    },
    link: {
      type: 'object',
      additionalProperties: false,
      required: ['url', 'text'],
      properties: {
        url:  { type: 'string', format: 'uri' },
        text: { type: 'string', minLength: 1 }
      }
    },
    // Media is one of two shapes. Images and videos carry a local file
    // (`src`); Figma prototypes carry an external `url` plus a `poster`
    // still that stands in for them in the gallery filmstrip.
    media: {
      oneOf: [
        {
          type: 'object',
          additionalProperties: false,
          required: ['type', 'src', 'alt'],
          properties: {
            type:    { enum: ['image', 'video'] },
            src:     { type: 'string', minLength: 1 },
            alt:     { type: 'string' },
            caption: { type: 'string' },
            poster:  { type: 'string' }
          }
        },
        {
          type: 'object',
          additionalProperties: false,
          required: ['type', 'url', 'poster', 'alt'],
          properties: {
            type:    { const: 'figma' },
            url:     { type: 'string', minLength: 1, pattern: 'figma\\.com' },
            poster:  { type: 'string', minLength: 1 },
            alt:     { type: 'string' },
            caption: { type: 'string' },
            // Optional aspect-ratio override for the fullscreen frame,
            // e.g. "16:9" or "9:16". Blank → derived from the poster.
            aspect:  { type: 'string', pattern: '^\\d+(\\.\\d+)?([:/]\\d+(\\.\\d+)?)?$' }
          }
        }
      ]
    }
  }
};

const siteSchema = {
  $id: 'site.json',
  type: 'object',
  additionalProperties: false,
  required: [
    'siteTitle', 'siteDescription', 'siteUrl', 'ogImage',
    'contactEmail', 'contactCopy', 'socials', 'analytics'
  ],
  properties: {
    siteTitle:       { type: 'string', minLength: 1 },
    siteDescription: { type: 'string', minLength: 1 },
    siteUrl:         { type: 'string', format: 'uri' },
    ogImage:         { type: 'string', minLength: 1 },
    contactEmail:    { type: 'string', format: 'email' },
    contactCopy: {
      type: 'array',
      minItems: 1,
      items: { type: 'string', minLength: 1 }
    },
    socials: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['label', 'url', 'displayText'],
        properties: {
          label:       { type: 'string', minLength: 1 },
          url:         { type: 'string', format: 'uri' },
          displayText: { type: 'string', minLength: 1 }
        }
      }
    },
    analytics: {
      type: 'object',
      additionalProperties: false,
      required: ['googleAnalyticsId'],
      properties: {
        googleAnalyticsId: { type: 'string', minLength: 1 }
      }
    }
  }
};

function readJson(path) {
  if (!existsSync(path)) {
    console.error(`validate-data: missing ${relative(projectRoot, path)}`);
    process.exit(1);
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    console.error(`validate-data: ${relative(projectRoot, path)} is not valid JSON: ${err.message}`);
    process.exit(1);
  }
}

function formatErrors(errors, file) {
  return errors.map((err) => {
    const where = err.instancePath || '<root>';
    return `  ${file}${where}: ${err.message}${err.params ? ` (${JSON.stringify(err.params)})` : ''}`;
  });
}

function crossFieldChecks(projects) {
  const errors = [];
  const warnings = [];
  const seenSlugs = new Map();

  projects.forEach((project, idx) => {
    const where = `/projects/${idx}`;
    if (seenSlugs.has(project.slug)) {
      errors.push(`  projects.json${where}/slug: duplicate slug "${project.slug}" (also at /projects/${seenSlugs.get(project.slug)})`);
    } else {
      seenSlugs.set(project.slug, idx);
    }
    (project.media || []).forEach((item, mIdx) => {
      if (item.type === 'video' && !item.poster) {
        warnings.push(`  projects.json${where}/media/${mIdx}: video has no poster (recommended in BUILD_SPEC.md §6.1)`);
      }
      if (item.type === 'figma' && item.url && !/\/proto\//.test(item.url) && !/embed_host=/.test(item.url)) {
        warnings.push(`  projects.json${where}/media/${mIdx}: figma url is not a "/proto/" prototype link — the embed will show a static design, not a clickable prototype (BUILD_SPEC.md §6.1)`);
      }
    });
    if (project.protected && !project.password) {
      errors.push(`  projects.json${where}/password: required when "protected" is true`);
    }
    if (project.password && !project.protected) {
      warnings.push(`  projects.json${where}: "password" set but "protected" is not true — it has no effect`);
    }
  });

  return { errors, warnings };
}

function main() {
  const ajv = new Ajv({ allErrors: true, strict: true });
  addFormats(ajv);

  const validateProjects = ajv.compile(projectsSchema);
  const validateSite = ajv.compile(siteSchema);

  const projectsData = readJson(projectsPath);
  const siteData = readJson(sitePath);

  const projectsOk = validateProjects(projectsData);
  const siteOk = validateSite(siteData);

  const schemaErrors = [];
  if (!projectsOk) schemaErrors.push(...formatErrors(validateProjects.errors, 'projects.json'));
  if (!siteOk) schemaErrors.push(...formatErrors(validateSite.errors, 'site.json'));

  const { errors: crossErrors, warnings } = projectsOk
    ? crossFieldChecks(projectsData.projects)
    : { errors: [], warnings: [] };

  const allErrors = [...schemaErrors, ...crossErrors];

  if (allErrors.length > 0) {
    console.error('validate-data: validation failed.');
    for (const line of allErrors) console.error(line);
    if (warnings.length > 0) {
      console.warn('validate-data: warnings:');
      for (const line of warnings) console.warn(line);
    }
    process.exit(1);
  }

  console.log(`validate-data: ${projectsData.projects.length} project(s) and site settings validated OK.`);
  if (warnings.length > 0) {
    console.warn(`validate-data: ${warnings.length} warning(s):`);
    for (const line of warnings) console.warn(line);
  }
  process.exit(0);
}

main();
