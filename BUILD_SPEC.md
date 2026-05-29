# MENÉNDEZ MORRO — Portfolio Rebuild Build Spec

**Version:** 1.1 (Approved)
**Date:** May 29, 2026
**Status:** Approved — build authorized

This document defines what we are building and how. It is the contract between client and builder for the rebuild of `menendezmorro.com`. It will be handed to Claude Code as the implementation brief. Both parties must approve this document before any code is written.

**This is a living document.** Post-launch changes are expected. When changes happen, this document is updated, version-bumped, and re-approved before code changes. The standard for the site (lightweight, optimized, clean, professional, fully responsive) applies to every change made after launch, not just the initial build. No quick fixes that compromise code quality.

---

## 1. Goals and non-goals

### Goals

1. Rebuild the existing portfolio with a cleaner, faster, more maintainable codebase.
2. Achieve professional, lightweight, optimized, fully responsive output that works perfectly on every screen size.
3. Enable the owner to add, edit, and reorder projects through a visual admin panel without touching code or AI.
4. Significantly improve animation fluidity and overall page performance compared to the live site.
5. Implement clean, human-readable URLs for projects.

### Non-goals (out of scope for this build)

- About / Blog / CV / Services / Testimonials sections.
- Multi-language support.
- Comments, search, or social sharing widgets.
- Newsletter signup.
- A cookie banner.
- Auto-rotation, slideshows, timers of any kind.
- Filtering UI on Home (the data field for `subcategory` is preserved for future use, but no UI).
- E-commerce or any transactional functionality.

---

## 2. Shared vocabulary

These terms are used consistently in code, documentation, and conversation.

### Pages (URLs)
| Name | URL | Purpose |
|------|-----|---------|
| **Home** | `/` | Full-screen project cover gallery; horizontal scroll between projects |
| **Project page** | `/<slug>` (e.g., `/gestion-reaviva`) | Single project — gallery section + description section |
| **Contact page** | `/contact` | Standalone contact page |

### Home UI elements
- **Header bar** — top bar containing the logo (left) and "Contact" link (right).
- **Project title** — large project name positioned center-left of the viewport.
- **Role label** — horizontal text positioned center-right of the viewport. (This is a change from the current live site, where it is vertical.)
- **Info row** — bottom of the viewport, showing LOCATION / YEAR / DESCRIPTION.

### Project page elements

**Static elements** — always visible, fixed position, do NOT move when scrolling:
- **Get in touch** link (top-right corner) — opens email client.
- **Info row** — bottom-left, showing LINKS / DURATION / COST for the current project.
- **Back arrow** (bottom-right corner) — returns to Home via vertical sweep animation.

**Scrolling content** — changes as user scrolls vertically:
- **Gallery section** — top portion of the page, shows project media.
- **Description section** — below the gallery, white background, long-form text.

### Image fullscreen
A modal-like state opened by clicking/tapping an image in the gallery. Shows the image at full screen with a close button (X, top-right) and supports keyboard arrow navigation between images.

### Animations
- **Horizontal sweep** — left/right wipe transition. Used between Home covers.
- **Vertical sweep** — up/down wipe transition. Used for navigation between Home and sub-pages:
  - Home → Project page: Project slides **down from top**.
  - Project page → Home: reverse (Project slides **up**, off the top).
  - Home → Contact: Contact slides **down from top**.
  - Contact → Home: reverse (Contact slides **up**, off the top).
- **Line reveal** — text-mask reveal animation. Each text line is wrapped in a clipped container; line starts translated 100% below its container, then slides up into view. Staggered delay between lines. Easing `cubic-bezier(.33, 1, .55, 1)`, duration ~0.55s per line. Used for entry of Project page (description text, Get in touch CTA) and Contact page text — identical to current live site.
- **Snap transition (Project page)** — when scrolling between Gallery section and Description section, the page snaps with a smooth animation. Both directions (gallery → description, description → gallery). Tunable post-build.
- **No crossfade, no auto-rotation, no timers anywhere on the site.**

---

## 3. Tech stack

| Layer | Choice | Why |
|-------|--------|-----|
| Front-end | Vanilla HTML, CSS, JavaScript (no framework) | Fastest possible delivery; no runtime; matches "lightweight" goal; future-proof for self-maintenance |
| JS organization | Native ES modules (multiple small files, not one big file) | Maintainability without a build framework |
| CMS | Decap CMS (formerly Netlify CMS) | Free, Git-based, visual admin panel, drag-to-reorder support, GitHub auth |
| Hosting | Netlify (free tier) | Auto-deploys from GitHub, fast global CDN, free HTTPS, deep Decap CMS integration |
| Domain | Existing Nominalia domain, DNS pointed at Netlify | Owner keeps the domain registration; cancels Nominalia hosting at next renewal |
| Repository | GitHub (private repo) | Required by Decap CMS; standard professional workflow |
| Analytics | Google Analytics (existing) | Free, owner already familiar; will be deduplicated and corrected during rebuild |
| Image optimization | Build-time script using `sharp` (Node.js) | Generates WebP + multiple sizes from source images; owner runs one command after adding new media |
| Form validation | JSON Schema validation on commit (CI) | Prevents broken `projects.json` from publishing |

**Explicitly not used:** React, Next.js, Astro, Tailwind, npm runtime dependencies on the live site, jQuery, any third-party JS library larger than ~10KB minified.

---

## 4. URL structure

| URL | Page | Notes |
|-----|------|-------|
| `/` | Home | Always shown without query strings or hashes |
| `/<slug>` | Project page | E.g., `/morro`, `/gestion-reaviva`, `/festival-z` |
| `/contact` | Contact page | |
| `/admin/` | Decap CMS admin | GitHub login required |

**Slug rules:**
- Lowercase ASCII only.
- Words separated by hyphens.
- No accents (é → e), no special characters, no underscores.
- Generated automatically from project title; editable manually in the CMS.
- Must be unique. CMS will warn on conflict.

**Slug migration map** (from current site to new site):

| Old | New |
|-----|-----|
| `#morro` | `/morro` |
| `#gestion_reaviva` | `/gestion-reaviva` |
| `#festivalz` | `/festival-z` |
| `#un_altre_peto` | `/un-altre-peto` |
| `#me_olvido` | `/me-olvido` |
| ... | ... (all underscores → hyphens) |

301 redirects will be configured on Netlify so that any old `#xxx` links shared externally still work.

---

## 5. Page behavior specifications

### 5.1 Home

**Visual layout:**
- Full-viewport image (current cover).
- Header bar overlaid at top.
- Project title center-left, Role label center-right, Info row bottom.

**Interactions:**
- **Mouse wheel / trackpad scroll** → horizontal sweep to next/previous project. (Both vertical and horizontal gestures map to horizontal navigation.)
- **Drag (touchpad / touchscreen)** → horizontal sweep to next/previous project.
- **Keyboard:** left/right arrows = previous/next project. Esc does nothing on Home.
- **Click on the Project title or Role label** → navigate to that project's page via vertical sweep (Project slides down from top). The cover image itself and the Info row are NOT clickable for navigation.
- **Click logo "MENÉNDEZ MORRO"** → no-op on Home (already there).
- **Click "Contact"** → navigate to Contact page via vertical sweep (Contact slides down from top).

**State:**
- The current project index is remembered. If the user navigates to a Project page and back, Home returns to the cover of the project they were viewing — not project 0.
- URL stays at `/` regardless of which cover is showing. Browser back/forward affects navigation between Home/Project/Contact, but does NOT step through individual covers.

**Performance:**
- The cover image for the currently-shown project is loaded with `fetchpriority="high"`.
- The next and previous project covers are preloaded with `fetchpriority="low"`.
- All other covers are lazy-loaded.

### 5.2 Project page

**Vertical structure:**
```
┌─────────────────────────────────────────────┐
│  [Get in touch ↗]              (static)      │
│                                              │
│            GALLERY SECTION                   │
│         (horizontal filmstrip)               │
│                                              │
│ [LINKS  DURATION  COST]      [← back arrow] │  ← static, always visible
└─────────────────────────────────────────────┘
         ↓ scroll past last gallery image
┌─────────────────────────────────────────────┐
│  [Get in touch ↗]              (static)      │
│                                              │
│           DESCRIPTION SECTION                │
│         (white background, text)             │
│                                              │
│ [LINKS  DURATION  COST]      [← back arrow] │  ← static, always visible
└─────────────────────────────────────────────┘
```

**Entry:**
- User clicks a project's title or role label on Home → vertical sweep (Project slides **down from top**). Page lands in Gallery section, scroll position at the start (first image).
- Direct URL access (`/gestion-reaviva`) → page loads in Gallery section, first image visible (no sweep animation, but the same Line reveal applies to text elements on the Project page).
- On Project page entry, text elements (description, Get in touch CTA) animate in with the **Line reveal** animation, identical to the current live site.

**Static elements (do NOT move when scrolling):**
- Get in touch link — top-right.
- Info row (LINKS / DURATION / COST) — bottom-left.
- Back arrow — bottom-right.
- These are visible throughout both Gallery and Description sections.
- Visual design and placement match the current live site exactly.

**Get in touch behavior:** Clicking the "Get in touch" link **copies the email address to the clipboard** (does NOT open a mail client) and shows a brief toast popup with the text "Email copied" which fades out automatically after ~2 seconds. The toast appears at the **center of the viewport** (horizontally and vertically centered).

**Gallery section — Desktop:**

- Images displayed in a single horizontal row, each at a **fixed height** (with breathing room above and below — does NOT fill viewport vertically). Width is natural based on each image's aspect ratio. Reference: matches the screenshot provided on May 27.
- **Small consistent gap** between images: ~20px (final value tuned during build).
- Row extends off-screen to the right. The number of images visible at any moment depends on their individual widths — vertical/portrait images can result in more images visible initially than wider/landscape ones. There is no fixed cap on visible image count.
- **Navigation (desktop):**
  - **Scroll always controls the gallery regardless of cursor position.** The user must scroll through the entire gallery (advancing horizontally through all images) before vertical scroll begins to reveal the Description section.
  - **Drag** anywhere in the gallery also moves it horizontally.
  - **No arrow buttons on desktop.** Arrow keys on the keyboard also do NOT navigate the gallery in the regular view — they only function in Image fullscreen.
- **Scroll distance per event:** approximately 30% of the gallery's visible width, scaled to screen size. Not snap-to-image, not pixel-by-pixel. Tunable post-build.
- **Click an image** → opens Image fullscreen.
- **Past the last image:** continuing to scroll forward → triggers the **Snap transition** to the Description section, which lands snapped to the top of the viewport. The reverse (scroll up while at the top of the Description section) → Snap transition back to the Gallery section at the last image position.
- **Videos in gallery:** autoplay muted, loop, no controls. Click to open in Image fullscreen (where they get controls).

**Gallery section — Mobile:**

- Images in a single horizontal row.
- All images at the **same fixed height**, with natural widths (different per image).
- Breathing room above and below the row.
- **Horizontal swipe** = navigate between images.
- **Vertical swipe** = triggers the **Snap transition** to the Description section.
- **Arrow buttons** visible on mobile (small, tappable, positioned for thumb reach) — navigate previous/next image.
- **Tap an image** → opens Image fullscreen.

**Description section:**

- Identical look, feel, and behavior to the current live site's project page description.
- Layout: long-form `longDescription` text on the upper portion.
- Static elements (Get in touch, Info row, Back arrow) remain visible.
- Vertical scroll reveals more text as currently (Line reveal animation applies as text comes into view, identical to current site).
- Scrolling back up at the top → **Snap transition** back to the Gallery section, landing at the position of the last image.

**Exit:**
- Click back arrow → vertical sweep back to Home (Project slides **up**, off the top — reverse of entry).
- Click MENÉNDEZ MORRO logo → same as back arrow: vertical sweep back to Home (Project slides up).
- Click Get in touch → copies the email address to clipboard and shows the "Email copied" toast (no navigation).
- Browser back button → returns to the previous page in history (Home, in normal flow).

### 5.3 Contact page

**Behavior:** Identical to the current live site. No structural changes — only the same code quality and performance improvements applied to the rest of the site. Text elements use the Line reveal animation on entry, identical to current site.

**Get in touch link:** copies email to clipboard + shows "Email copied" toast (same behavior as on Project pages).

**Entry from Home:** vertical sweep, Contact slides **down from the top**.
**Exit to Home:** reverse — Contact slides **up**, off the top.

### 5.4 Image fullscreen (modal-like state)

- Triggered by clicking/tapping an image in the Project page Gallery.
- Image shown at maximum size that fits viewport while preserving aspect ratio.
- **X button** top-right corner.
- **Keyboard arrows** (left/right) navigate to previous/next image in the same project.
- **Esc key** closes the fullscreen.
- **Click outside the image** closes the fullscreen.
- For videos: shows video with native HTML5 controls, autoplay, loop.
- Closes back to the Gallery section at the same scroll position.

---

## 6. Data model

### 6.1 `projects.json` structure

```json
{
  "projects": [
    {
      "id": "morro",
      "slug": "morro",
      "title": "MORRO",
      "role": "Branding & UX/UI Design",
      "year": "2024",
      "location": "Mallorca",
      "type": "design",
      "subcategory": ["branding"],
      "description": "Digital design studio.",
      "longDescription": "Branding and UX/UI design for MORRO...\n\nThe goal was...",
      "link": "https://morrostudio.com/",
      "linkText": "morrostudio.com",
      "duration": "3 months",
      "cost": "1900€",
      "media": [
        { "type": "image", "src": "assets/media/morro/morro_1.jpg", "alt": "MORRO cover" },
        { "type": "image", "src": "assets/media/morro/morro_2.jpg", "alt": "MORRO image 2" },
        { "type": "video", "src": "assets/media/morro/morro_7.mp4", "poster": "assets/media/morro/morro_7.jpg" }
      ]
    }
  ]
}
```

**Field notes:**
- `id` and `slug` are usually identical. `id` is internal; `slug` appears in the URL.
- `type`: either `"design"` or `"photo"`. Unused in UI but preserved for future filtering.
- `subcategory`: always an array. Unused in UI but preserved for future filtering. (Current data has both string and array forms — will be normalized to array during migration.)
- `media[0]` is the cover image shown on Home AND the first image of the project gallery.
- `alt` text: required for accessibility. Auto-generated as `<Project title> image N` if not provided.
- Videos: `poster` is optional but recommended (used as fallback if video fails to load).

### 6.2 `site.json` structure (new file — site-wide settings)

```json
{
  "siteTitle": "MENÉNDEZ MORRO",
  "siteDescription": "Portfolio of design and photography projects by Martí Menéndez.",
  "siteUrl": "https://menendezmorro.com",
  "ogImage": "assets/og-image.jpg",
  "contactEmail": "martimm99@gmail.com",
  "contactCopy": [
    "MENÉNDEZ MORRO is a creative space that gathers Design and Photography projects...",
    "Especially interested in music and culture projects...",
    "Web Design & Development by Martí Menéndez."
  ],
  "socials": [
    { "label": "INSTAGRAM", "url": "https://www.instagram.com/uepmorro/", "displayText": "@uepmorro" }
  ],
  "analytics": {
    "googleAnalyticsId": "G-J5D6SHTPS7"
  }
}
```

This allows the owner to edit SEO meta titles, descriptions, contact info, and analytics ID through the CMS without touching code.

---

## 7. Decap CMS schema

The admin panel at `/admin/` will show two collections:

### Collection 1: "Site settings" (singleton)
Fields editable through forms:
- Site title (text)
- Site description (text, SEO)
- OG image (image upload)
- Contact email (text)
- Contact copy (list of paragraphs)
- Social links (list with label, URL, display text)
- Google Analytics ID (text)

### Collection 2: "Projects" (list, drag-to-reorder)
For each project, fields:
- Title (text, required)
- Slug (text, auto-generated from title, editable)
- Role (text, required)
- Year (text, required)
- Location (text)
- Type (select: design / photo)
- Subcategory (multi-select: branding, web, titles, architecture, live)
- Short description (text, shown in Home Info row)
- Long description (markdown, shown on Project page)
- External link (URL)
- Link display text (text)
- Duration (text)
- Cost (text)
- **Media** (list, drag-to-reorder):
  - Type (select: image / video)
  - File (image or video upload)
  - Alt text (text, for accessibility)
  - Poster (image upload, videos only)

**Drag-to-reorder** works at two levels: project order on Home, and media order within a project's gallery.

### Authentication

The admin panel at `/admin/` is protected by **GitHub OAuth**:

- Only users who are collaborators on the GitHub repository can log in.
- Initially, only the owner (Martí) is added as a collaborator. No other access is granted.
- Login flow: visit `/admin/` → click "Login with GitHub" → GitHub authentication (with the owner's GitHub password, plus 2FA if enabled on the GitHub account) → access granted.
- Visitors who are not collaborators see a login button but cannot authenticate, regardless of GitHub account.
- There is no separate username/password to manage — authentication piggybacks on GitHub credentials.
- The owner can revoke access at any time by removing collaborators from the GitHub repo settings.

**Recommendation:** enable 2FA on the GitHub account for an additional layer of security. Free, takes 2 minutes to set up.

---

## 8. File structure

```
menendezmorro-portfolio/
├── public/                         # Files served as-is by Netlify
│   ├── index.html                  # Home
│   ├── project.html                # Project page template (JS hydrates content from slug)
│   ├── contact.html                # Contact page
│   ├── 404.html                    # Custom 404
│   ├── robots.txt
│   ├── sitemap.xml                 # Generated at build time
│   ├── _redirects                  # Netlify redirects (old hash URLs → new clean URLs)
│   └── admin/
│       ├── index.html              # Decap CMS entry
│       └── config.yml              # Decap CMS schema
│
├── assets/
│   ├── fonts/                      # Web fonts
│   ├── icons/                      # SVG icons
│   ├── favicon.png
│   ├── og-image.jpg
│   └── media/
│       └── <project-slug>/         # One folder per project
│           ├── 1.jpg               # Source image (large, master)
│           ├── 1-mobile.webp       # Auto-generated by build script
│           ├── 1-desktop.webp      # Auto-generated by build script
│           └── ...
│
├── content/
│   ├── projects.json               # All project data
│   └── site.json                   # Site settings
│
├── src/
│   ├── css/
│   │   ├── tokens.css              # Colors, fonts, spacing variables
│   │   ├── reset.css               # Modern CSS reset
│   │   ├── base.css                # Body, typography
│   │   ├── layout.css              # Header, page structures
│   │   ├── home.css                # Home-specific styles
│   │   ├── project.css             # Project page styles
│   │   ├── contact.css             # Contact page styles
│   │   ├── fullscreen.css          # Image fullscreen modal
│   │   └── responsive.css          # Media queries
│   │
│   └── js/
│       ├── main.js                 # Entry point; routes to page-specific code
│       ├── router.js               # Handles URL routing and history
│       ├── transitions.js          # Horizontal/vertical sweep animations
│       ├── data.js                 # Loads projects.json and site.json
│       ├── home.js                 # Home page interactions
│       ├── project.js              # Project page interactions
│       ├── gallery.js              # Gallery section logic (scroll, drag, arrows)
│       ├── fullscreen.js           # Image fullscreen modal
│       ├── contact.js              # Contact page interactions
│       └── utils.js                # Shared helpers (debounce, etc.)
│
├── scripts/
│   ├── optimize-images.js          # Run once after adding new media — generates responsive variants
│   ├── validate-data.js            # Validates projects.json against schema
│   └── build-sitemap.js            # Generates sitemap.xml from projects.json
│
├── .github/
│   └── workflows/
│       └── validate.yml            # CI: runs validate-data.js on every push
│
├── package.json                    # Dev dependencies only (sharp, etc.). Live site has zero npm runtime deps.
├── netlify.toml                    # Netlify build config
├── README.md                       # How to add projects, run scripts, deploy
└── .gitignore
```

**Notes:**
- The live site loads only `index.html` / `project.html` / `contact.html` plus their referenced CSS/JS. No bundler. No npm at runtime.
- `src/` is the working source. CSS and JS are loaded directly by the HTML files (or, optionally, concatenated into single `bundle.css` / `bundle.js` files by a one-line build step — TBD during build).
- Decap CMS writes directly to `content/projects.json` and `content/site.json` via GitHub commits.

---

## 9. Performance targets

| Metric | Target | Notes |
|--------|--------|-------|
| Total Home page weight (first load) | < 500 KB | Including critical CSS, JS, fonts, first cover image |
| Largest Contentful Paint (LCP) on Home | < 1.5s on 4G | Cover image is the LCP |
| First Input Delay (FID) | < 50ms | |
| Cumulative Layout Shift (CLS) | < 0.05 | |
| Lighthouse Performance score | ≥ 95 | On all three pages |
| Lighthouse Accessibility score | ≥ 95 | On all three pages |
| Lighthouse Best Practices score | 100 | On all three pages |
| Lighthouse SEO score | 100 | On all three pages |
| Largest single image served | < 300 KB | Via WebP + responsive sizes |
| Total media folder size (source files) | ≤ current 56MB | Won't fight this; optimization happens at serving, not source |

**Optimization techniques used:**
- WebP format for all images, with JPEG fallback via `<picture>`.
- Responsive image sizes: `mobile` (≤768px), `desktop` (>768px), `2x` retina variants where appropriate.
- Lazy loading for off-screen images via `loading="lazy"`.
- `fetchpriority` hints for above-the-fold images.
- Subset web fonts to Latin characters only; preloaded with `<link rel="preload">`.
- Inline critical CSS in `<head>`; defer the rest.
- All JS deferred or async; no render-blocking scripts.
- No external font services (self-host fonts to avoid third-party connection cost).
- HTTP/2 enabled by default on Netlify.
- Brotli compression enabled by default on Netlify.

---

## 10. Accessibility and SEO baseline

**Accessibility:**
- Semantic HTML (`<header>`, `<main>`, `<nav>`, `<aside>`).
- All images have meaningful `alt` text (set in CMS).
- Keyboard navigation works for all interactions (Home arrows, gallery arrows, modal Esc, etc.).
- Focus states visible.
- ARIA labels on icon-only buttons.
- Color contrast meets WCAG AA on all text.

**SEO:**
- Unique `<title>` and `<meta description>` per page (Project pages auto-generate from project data; site-wide fallbacks editable in CMS).
- Open Graph and Twitter Card meta tags on every page.
- `sitemap.xml` auto-generated from `projects.json`.
- `robots.txt` allows crawling.
- Clean URLs (no hashes, no underscores).
- Structured data (JSON-LD `CreativeWork`) for each project.
- Canonical URLs.

---

## 11. Migration and deployment plan

**Phase 0: Setup (no live impact)**
- Create new GitHub repo.
- Set up Netlify site connected to repo, served on a `netlify.app` subdomain.
- Set up Decap CMS at `/admin/`.

**Phase 1: Build (no live impact)**
- Develop the new site in the repo.
- Migrate `projects.json` data: normalize subcategories, generate slugs, copy media.
- Run image optimization script.
- Test on all major screen sizes (320px, 375px, 768px, 1024px, 1440px, 1920px, 2560px+).
- Test on Chrome, Safari, Firefox (desktop + mobile).
- Hit performance and accessibility targets.

**Phase 2: Internal review (no live impact)**
- Owner reviews the new site at the Netlify subdomain.
- Fixes and refinements.
- Sign-off.

**Phase 3: Go live**
- Update DNS records at Nominalia to point at Netlify.
- 301 redirects for old hash URLs configured in `_redirects`.
- Verify the domain resolves to the new site (allow up to 24h for DNS propagation; typically faster).
- Confirm Google Analytics is firing.

**Phase 4: Post-launch**
- Verify Google Search Console picks up new URLs.
- Monitor for 404s; add additional redirects if needed.
- Owner cancels Nominalia hosting at next renewal date.

---

## 12. What the owner will be responsible for after launch

- Adding new projects via the Decap CMS admin panel.
- Reordering projects (drag-to-reorder in admin).
- Uploading new media through the admin panel.
- After uploading new images, running one command locally to optimize them: `npm run optimize-images`. (Optional: this can also be automated via GitHub Actions later.)
- Editing SEO metadata, contact info, and site title through the admin panel.

The owner will NOT need to:
- Touch HTML/CSS/JS files for normal content updates.
- Use the terminal except for the optional image optimization step.
- Manually deploy — every change committed via the CMS auto-deploys.

---

## 13. Build phases

Each phase is a discrete chunk of work executed in Claude Code. After each phase, the owner reviews and approves before the next phase starts.

| # | Phase | Deliverable | Est. effort |
|---|-------|-------------|-------------|
| 1 | Project skeleton & tooling | Empty repo with file structure, package.json, build scripts, Netlify config, validation CI | Small |
| 2 | Data migration | New `projects.json` and `site.json` from existing data, with normalized slugs and subcategories | Small |
| 3 | Image optimization pipeline | Working `optimize-images.js` script; all current media optimized | Medium |
| 4 | Base CSS + tokens | `tokens.css`, `reset.css`, `base.css`, typography, color system | Small |
| 5 | Home page | Full Home implementation: covers, header, project title, role, info row, horizontal sweep, keyboard nav, all responsive | Large |
| 6 | Project page — Gallery section | Gallery filmstrip, scroll/drag/arrow navigation, hover-based scroll switching, responsive desktop + mobile | Large |
| 7 | Project page — Description section + static elements | Description, Get in touch link, info row, back arrow, transition between gallery and description | Medium |
| 8 | Image fullscreen modal | Click-to-open, keyboard navigation, video handling | Medium |
| 9 | Contact page | Faithful reimplementation with new code | Small |
| 10 | Transitions | Vertical sweep (Home ↔ Project, Home ↔ Contact), polish horizontal sweep | Medium |
| 11 | Decap CMS setup | `/admin/` working, schema configured, GitHub auth, drag-to-reorder | Medium |
| 12 | SEO, sitemap, structured data, redirects | All meta tags, generated sitemap, 301 redirects file | Small |
| 13 | Cross-browser & cross-device testing | Manual QA across all target devices and browsers | Medium |
| 14 | Performance audit | Lighthouse runs, hit all targets, fix regressions | Medium |
| 15 | Go live | DNS migration, post-launch verification | Small |

---

## 14. Sign-off

By approving this document, both parties agree to:

- Build only what is specified above.
- Not introduce scope changes mid-build without explicit re-approval.
- Re-open this document for amendment if a real need arises.

**Client (Martí):** _____________________________ Date: _______

**Builder (Claude):** _____________________________ Date: _______

---

## Appendix A: Open questions to resolve during build

Things deliberately deferred to build time, with reasonable defaults noted:

- Final value for "scroll distance per event" in the gallery (default: 30% of visible width).
- Final value for inter-image gap in the gallery (default: 20px).
- Exact gallery vertical padding (default: header height + ~80px top, ~120px bottom for static elements).
- Whether to inline CSS or load as separate file (default: inline critical, load rest async).
- Whether to bundle JS modules into one file or keep separate (default: keep separate; HTTP/2 handles this efficiently).
- Mobile breakpoint exact value (default: 768px).

## Appendix B: Decisions deliberately deferred to future versions

- Typography change (kept current fonts as placeholder).
- About / Blog / CV sections.
- Plausible or other privacy-friendly analytics replacement.
- Filtering UI re-introduction.
- Image optimization automation via GitHub Actions.
