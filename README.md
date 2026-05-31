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
npm install                   # installs dev tooling (sharp, ajv)
npm run validate              # validates content/projects.json against the schema
npm run generate-placeholders # writes placeholder JPEGs to assets/media/<slug>/ for any project lacking final media (see BUILD_SPEC.md Appendix D)
npm run optimize-images       # generates responsive WebP variants from assets/media/
npm run build-sitemap         # regenerates public/sitemap.xml from content/projects.json
```

### Optimize images

`npm run optimize-images` produces two WebP variants per source image
(`<name>-mobile.webp` at max 768px wide, `<name>-desktop.webp` at max 1920px
wide) in the same folder as the source. The mobile variant is skipped when
the source is already ≤ 768px wide. The script is idempotent — a variant is
regenerated only when its mtime is older than the source, so re-running after
adding a single new image is cheap. Pass `-- --force` to regenerate every
variant (e.g. after changing the quality setting); pass `-- --slug=<slug>` to
restrict the run to one project folder. Every output is checked against the
300 KB per-image budget from BUILD_SPEC.md §9; if a variant exceeds it, the
run fails with the offending file path so the owner can re-export the source
at smaller dimensions before publishing.

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
