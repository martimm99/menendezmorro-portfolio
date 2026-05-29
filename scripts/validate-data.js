/**
 * validate-data.js
 *
 * Validates content/projects.json and content/site.json against JSON Schema
 * before a commit reaches production. Run locally via `npm run validate` and
 * automatically in CI on every push and pull request.
 *
 * See BUILD_SPEC.md §6 (data model) for the authoritative shape and §7
 * (Decap CMS schema) for the fields the CMS writes. Full schema and field
 * checks are implemented in Phase 2 alongside the migrated data.
 *
 * Exit codes:
 *   0  validation passed (or no data files present yet — Phase 1 only)
 *   1  validation failed
 */

import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const projectsPath = resolve(projectRoot, 'content/projects.json');
const sitePath = resolve(projectRoot, 'content/site.json');

const projectsExists = existsSync(projectsPath);
const siteExists = existsSync(sitePath);

if (!projectsExists && !siteExists) {
  console.log('validate-data: no content files present yet (Phase 2 will add projects.json and site.json). Nothing to validate.');
  process.exit(0);
}

console.log('validate-data: schema validation is not implemented yet. It will be added in Phase 2 alongside the migrated data.');
if (projectsExists) console.log(`  found: ${projectsPath}`);
if (siteExists) console.log(`  found: ${sitePath}`);
process.exit(0);
