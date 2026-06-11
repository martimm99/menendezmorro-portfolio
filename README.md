# MORRO — Portfolio

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
npm run generate-placeholders # writes placeholder JPEGs for projects lacking final media plus the OG image (see BUILD_SPEC.md Appendix D)
npm run optimize-images       # generates responsive WebP variants from assets/media/
npm run build-sitemap         # regenerates public/sitemap.xml from content/projects.json
npm run build                 # assembles the publish tree at public/ from src/, assets/, content/
npm run preview               # builds then serves public/ at http://localhost:8080
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

```sh
npm run preview
```

Builds the publish tree into `public/` (from `src/css/`, `src/js/`, `src/html/`, `assets/`, and `content/`) and starts a tiny static HTTP server at **http://localhost:8080**. Press Ctrl+C to stop.

The preview server mirrors Netlify's SPA fallback: any path without a file extension that doesn't match a real file is served as `index.html`, so direct URL access to `/<slug>` or `/contact` works locally exactly like it will in production.

To rebuild without the server (e.g. to inspect what would land on Netlify), use `npm run build`. Outputs go to `public/`; static placeholders like `public/404.html`, `public/admin/`, and `public/_redirects` are preserved across builds.

To change the port, set `PORT`:

```sh
PORT=3000 npm run preview
```

## Project structure

See `BUILD_SPEC.md` §8 for the authoritative file layout. The CSS layer in
`src/css/` is organized as `tokens.css` (design vocabulary — colors,
typography, spacing, animation, z-index), `reset.css` (minimal modern
reset), `base.css` (font loading, body defaults, dark/light surface system),
and `responsive.css` (media queries; populated as page-specific styles land
in later phases). Page-specific stylesheets (`home.css`, `project.css`,
`contact.css`, `fullscreen.css`) pull from the tokens rather than hardcoding
values.

## Deployment

Pushes to `main` deploy automatically through Netlify. The CI workflow in `.github/workflows/validate.yml` runs `npm run validate` on every push and pull request.
