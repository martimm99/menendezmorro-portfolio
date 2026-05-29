# MENÉNDEZ MORRO — Portfolio

Rebuild of [menendezmorro.com](https://menendezmorro.com), a design and photography portfolio for Martí Menéndez.

The full specification lives in [`BUILD_SPEC.md`](./BUILD_SPEC.md). Read it before contributing.

## Stack

Vanilla HTML, CSS, and native ES modules. No framework, no bundler, no npm runtime dependencies on the live site. Hosted on Netlify, content edited through Decap CMS at `/admin/`.

## Prerequisites

- Node.js **20** or newer (dev tooling only — image optimization and data validation).
- A modern browser for local preview.

## Scripts

```sh
npm install              # installs dev tooling (sharp, ajv)
npm run validate         # validates content/projects.json against the schema
npm run optimize-images  # generates responsive WebP variants from assets/media/
npm run build-sitemap    # regenerates public/sitemap.xml from content/projects.json
```

## Local preview

Serve the `public/` directory with any static server, for example:

```sh
npx serve public
```

The site has no build step — files in `public/`, `src/`, `assets/`, and `content/` are served as-is once the structure is wired up in later phases.

## Project structure

See `BUILD_SPEC.md` §8 for the authoritative file layout.

## Deployment

Pushes to `main` deploy automatically through Netlify. The CI workflow in `.github/workflows/validate.yml` runs `npm run validate` on every push and pull request.
