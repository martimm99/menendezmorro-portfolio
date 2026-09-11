# MORRO — Portfolio Rebuild Build Spec

**Version:** 1.25 (Approved)
**Date:** September 11, 2026
**Status:** Approved — build authorized

**Changes from v1.24:**
- **New: password-protected projects (§5.5).** A project can be marked `protected` with a `password` in the CMS. Clicking it from Home shows a password screen instead of the project — same URL, same vertical sweep, just a different initial view. A soft gate, not real access control (the site has no server) — deliberately scoped that way; see §5.5 for exactly what it does and doesn't guarantee. The gated project's real gallery/description/links are held out of `window.__SITE_DATA__` entirely (on every page, including the project's own) and fetched from a separate static file only after the password is entered, so a casual view-source doesn't defeat it the way a purely-cosmetic lock screen would. Home shows a small lock badge beside a protected project's title. Zero added weight on any non-protected page — the gate's JS, its hangman artwork, and its stylesheet are only ever requested on a protected project's own page.

**Changes from v1.23:**
- **Image fullscreen: the X is back, repurposed and animated.** A prior version deliberately removed the fullscreen close button; it's now reinstated as the project page's existing top-right back arrow, which stays visible and on top while fullscreen is open instead of fading out with the rest of the chrome. Clicking it closes fullscreen (not "back to Home") while fullscreen is open; it reverts to normal Home navigation once closed. Its icon **morphs** between the X and two small diagonal arrows pointing at each other (a "compress" glyph on the same diagonal as the X), so the changed meaning is visible, not just implied — a true point-by-point geometry morph (not a cross-fade), ~620ms quintic ease. Desktop and mobile both get it. This also gives Figma prototype embeds (§5.2) a fully reliable close path, since Esc can be captured by the embedded prototype once it has focus. Implemented in `fullscreen.js` (`morphBackArrowIcon`, plus a capture-phase click interceptor) and `project.html` (the icon is now two independently-animatable `<polyline>`s instead of the static `#close` sprite reference). Corrects §5.2's and §5.4's stale descriptions — see below.
- **Spec correction: back arrow position.** §5.2 called it "bottom-right"; it has been top-right (beside Get in touch) since the Next Project feature shipped. Corrected here and in §5.4.

**Changes from v1.22:**
- **Home: the cover background opens the current project.** Previously only the project title did (desktop already had a quiet `.cover-stage` click, undocumented; now formalised and extended to mobile). Desktop = click; mobile = **tap**, separated from a navigation swipe purely by movement — under ~10px of pointer travel opens the project, ~50px+ navigates prev/next, the band between does nothing. Uses `.cover-stage` containment so the title, header links, and preloader are unaffected. Implemented in `home.js` (`setupDrag` pointerup for touch; existing `.cover-stage` click for desktop). Also corrects a long-standing spec/code mismatch: §5.1 and §5.2 claimed the **Role label** opens the project on Home — it never did in code (only the title). Spec now matches: title + cover open the project; the role label does not.

**Changes from v1.21:**
- **Spec reconciled with the Home auto-advance timer (already shipped).** The "NEXT PROJECT" button on Home has, since ~June 2026, doubled as a 7-second auto-advance timer: its label fills left-to-right and, on reaching full, triggers a horizontal sweep to the next project (wrapping last → first). The spec previously listed "timers of any kind" as a non-goal and stated "no timers anywhere on the site" — both now corrected. Behaviour documented in §2 (Home UI elements, Animations) and §5.1 (new "Auto-advance" subsection): desktop/hover only; pauses while hovering the button (which also brightens it) or the project title; any manual navigation drains and resets it; the countdown does not start until the preloader has finished. Open accessibility gap noted in Appendix A (no dedicated pause control; not suppressed under `prefers-reduced-motion`).

**Changes from v1.20:**
- **Gallery media: third type — Figma prototype embeds.** In addition to `image` and `video`, a gallery media item can be `type: "figma"`: an embedded, interactive Figma prototype. In the filmstrip it renders as a required `poster` still with a small "Prototype" cue (it does not run inline — same principle as gallery videos having no controls). Clicking/tapping it opens Image fullscreen, where a live Figma `<iframe>` is mounted over the expanded poster and the prototype becomes fully interactive. Closing removes the iframe. Data fields: `url` (Figma share link or embed code — required), `poster` (required), `alt` (required), `caption` (optional), `aspect` (optional `"W:H"` override for the fullscreen frame; defaults to the poster's shape). The embed uses Figma's `embed.figma.com` endpoint with `embed-host=menendezmorro`; the prototype must be shared as "Anyone with the link → can view". See §5.2, §5.4, §6.1, §7. Also: `cleanup-media.js` now preserves `poster` files (previously only `src` and `cover` were kept — video posters would have been deleted as orphans).

**Changes from v1.19:**
- **Site renamed to MORRO.** The display name across all HTML, data, and documentation has been updated from "MENÉNDEZ MORRO" to "MORRO". The domain (`menendezmorro.com`) and repository/folder names are unchanged.
- **Cover image separated from gallery.** The home page cover is now a dedicated field (`cover`, `coverAlt`) in `projects.json`, independent of `media[]`. `media[0]` is no longer the cover — it is the first gallery image. The renderer falls back to `media[0]` when `cover` is absent. Naming convention: `<slug>-cover.jpg` in the project's media folder. See §6.1.
- **Gallery: all images fixed height.** All gallery images share the same height (`min(70vh, 50vw)`), width auto. The previous `max-width` cap that caused very wide/panoramic images to shrink below the standard height has been removed. Panoramic images are now the same height as all others and extend further to the right. See §5.2.
- **Gallery snap: last image right-aligned.** The last image snaps so its right edge sits at `--page-pad-x` from the viewport right — mirroring image 1's left-aligned home position. Images 2..N-1 continue to snap centred. This supersedes the v1.19 rule that images 2..N all snap centred. See §5.2.
- **Image optimization: mobile WebP raised to 1536px.** The mobile variant is now capped at 1536px wide (was 768px), covering 3× retina phones at the 768px CSS breakpoint. Cover images use quality 85 and a 2560px desktop cap; gallery images use quality 80 and a 1920px desktop cap. Cover files are detected by the `-cover` suffix in the filename. See §9.

**Changes from v1.18:**
- **Keyboard arrows in description scroll, then snap.** `ArrowDown` in description view now smooth-scrolls the description text down by 80px per press; only when the text is already scrolled to its bottom does it snap forward to the gallery. `ArrowUp` symmetrically scrolls the description up, no-op at the top. In gallery view, `ArrowUp` always snaps back to description regardless of which image is currently visible — one keystroke exits the section. Mirrors the wheel-then-snap pattern.
- **Gallery snaps: image 1 at left, image 2+ centered.** *(Superseded by v1.20 — last image is now right-aligned rather than centred; see §5.2.)* Image 1 has a "home" position at the left of the viewport. Images 2..N-1 snap centred. `resetToStart` parks at scroll = 0. Mobile is unchanged.

**Changes from v1.17:**
- **Keyboard navigation on project + contact pages.** Window-level `keydown` listener works without a focused element first. Project page:
  - `Escape` → vertical sweep back to home (deferred to fullscreen.js's own Escape if a fullscreen image is open — closes fullscreen first, then a subsequent Escape returns home).
  - `ArrowDown` (description view) → snap to gallery overlay.
  - `ArrowUp` (gallery view, first image) → snap back to description.
  - `ArrowLeft` / `ArrowRight` (gallery view) → step prev / next image; same step API as the mobile arrow buttons. Reverses the v1.17 §5.2 rule that arrow keys do NOT navigate the gallery in regular view.

  Contact page: `Escape` → home. No arrow handling (no gallery, no sections).

**Changes from v1.16:**
- **Hover affordance extended to Get-in-touch CTA and Contact socials.** The hover pattern from project page LINKS / Gallery (arrow slides up from a clipping mask, text shifts) now also applies to:
  - **Get-in-touch CTA** (top-right on project and contact pages) — straight left arrow (←) appears on the **right** of the label; text shifts left to make room. Mirror direction because the element is right-anchored. 280ms `cubic-bezier(.33, 1, .55, 1)`.
  - **Contact page socials** (Instagram, etc.) — NE diagonal arrow (↗) on the left of each link, text shifts right. Identical to the project page LINKS hover.
- The shared hover styles (`.info-link / .info-action / .info-arrow-clip / .cta-arrow-clip`) moved from `project.css` to `base.css` so they apply across both pages without duplication. Gated by `(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)` as with the other hovers.
- Contact socials anchor switched from `border-bottom` to `text-decoration: underline` (matching the LINKS underline style and avoiding the mobile `overflow: hidden` clipping issue).

**Changes from v1.15:**
- **Project page logo color follows section.** When the user is in the description section, the logo is the accent blue (`#0055ff`); when the gallery overlay is open, the logo transitions to black (`#000`). 700ms `ease` transition on `background-color`, kept in sync with the section snap animation. Implementation is pure CSS via `:has()` — the existing `.show-gallery` class on `.project-shell` (set by the snap functions) drives a descendant selector that targets the body-level `.site-logo`. No JS changes required. Captured in §5.2.

**Changes from v1.14:**
- **Site logo replaces the wordmark.** The `MORRO` text in the top-left header is replaced by an SVG logomark (`/assets/morro-logo.svg`) at `36px` height. Implemented as a CSS mask filled by `currentColor`, so the existing page text-color cascade automatically renders the logo white on the home page's dark covers and black on the project description / contact white backgrounds. No JS, no two-version files. Logo accessibility name preserved via `aria-label` on the anchor. Captured in §5.1, §5.2, §5.3.
- **Project page info row reordered.** Old order `LINKS / DURATION / RESULTS`. New order `RESULTS / LINKS / DURATION` — surfaces the navigation affordance (the Gallery link) as the leading element of the row. Captured in §2, §5.2.

**Changes from v1.13:**
- **Hover affordance on click-through elements.** A thin arrow slides up from a clipping mask at the element's left edge, and the text shifts right to make room. On hover-out the arrow slides back down and the text returns. Animation: 280ms `cubic-bezier(.33, 1, .55, 1)`; CSS-only, no JavaScript. Three sites in the UI now share this affordance:
  - **Home project title** — SE diagonal arrow (↘) — clicking the title navigates into the project page. Composite-only implementation (absolute arrow + `transform: translateX` on the title text); zero layout cost. Captured in §5.1.
  - **Project page LINKS** — NE diagonal arrow (↗) on each individual external link (Website, Instagram, etc.). Per-item hover: only the hovered link shows the arrow. Inline-flex with a `width` transition on the arrow's clip so the comma separator and following links push right naturally — small bounded layout cost (<1ms per frame on a single info-row line). Captured in §5.2.
  - **Project page RESULTS "Gallery"** — SE diagonal arrow (↘), matching the home title since both lead the user "into" the project content. Same inline-flex pattern as LINKS. Captured in §5.2.
  - All three are gated behind `(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)`. Touch devices and reduced-motion users see no arrow and no shift. The home project role label is intentionally unaffected.

**Changes from v1.12:**
- **Info row: COST replaced with RESULTS → Gallery.** The third info-row cell on the Project page now shows `RESULTS` as its label and `Gallery` as a clickable link in place of the prior cost value. Clicking the link runs the same snap-to-gallery animation triggered by scrolling past the description bottom. The `cost` field is removed from the data model (`content/projects.json`), validator schema (`scripts/validate-data.js`), and Decap CMS form (`public/admin/config.yml`). The RESULTS cell auto-hides if a project has no gallery media. Captured in §5.2 (Project page — Static elements, Description section), §6.1 (data schema), and Appendix C (per-project entries lose `Cost:`).

**Changes from v1.11:**
- **Line reveal: two-phase scroll-triggered behavior.** Previously the per-line reveal animation fired once on entry for the whole text block, which left below-the-fold lines already statically revealed by the time the user scrolled to them. The new behavior splits at trigger time: clips that are on-screen when the post-sweep delay elapses fire as the existing cascade waterfall (per-line `--reveal-delay`); clips that are below the fold are observed individually and each visual line animates the moment it scrolls into the reading area. Each observed clip's cascade delay is overridden to 0ms on intersection so a scrolled-in line doesn't pause after entering view. The observer's `rootMargin` is `0px 0px -80px 0px` so the trigger zone excludes the chrome-mask band at the viewport bottom (the static-element area). A percentage rootMargin would trap the last line of a description behind the bottom padding (chrome-mask + 20px buffer) since native scroll bottoms out before the line can clear a percentage dead zone. Applies to the Project page description and the Contact page text. Captured in §2 (Animations → Line reveal), §5.2 (Project page — Description section), and §5.3 (Contact page).
- **Project page wheel: inertia-tail filter.** Same pattern the Home wheel got in v1.11 — events with `|delta| < 4` no longer refresh the gesture-end timer, so a long fling's weak inertia tail decays out of the gate and the next genuine swipe goes through immediately (no cursor nudge required between snap actions). Captured in §5.2.
- **Contact page static elements moved to body level.** `Get in touch` CTA and the social info row used to sit inside `<main class="contact-content">`, which had `position: fixed` with no explicit z-index — its stacking context buried its children below the body-level chrome-mask pseudos (z 50) regardless of their own z-index. Both elements now live as siblings of the chrome masks at body level, restoring visibility. No visual change to spec; implementation detail only.
- **Mobile gallery: image centering fix.** A desktop-side `max-width: calc(100vw - 2 * --page-pad-x)` rule on `.gallery-item img/video` was cascading into the `≤768px` block, pinning images to the left edge of their (96vw) item. Mobile rule now overrides with `max-width: 100%`. No spec change; implementation detail only.

**Changes from v1.10:**
- **Home wheel: inertia-tail filter added.** A very long fling could keep firing wheel events with sizeable deltas for over a second, refreshing the gesture-end timer indefinitely and making swipes feel like they "stopped working" until the cursor moved. Events with |delta| < 4 no longer refresh the timer (or trigger a navigate), so an inertia tail decays out of the gate and the next genuine swipe goes through. Captured in §5.1.
- **Project gallery: no snap on touchpad release.** Touchpad swipes still free-scroll the gallery in real time and clamp at both edges, but when the user releases the gallery now stays at whatever scroll position they left it — the previous snap-to-nearest is gone. Mouse-wheel single-image step is unchanged; the step now uses the live scroll position so a wheel click after a free-scrolled touchpad swipe still lands on the actual next/previous image, even when the gallery is between two image positions. Captured in §5.2.

**Changes from v1.9:**
- **Home wheel: one navigation per gesture.** Replaces the action-cooldown gate. The previous 700ms cooldown could still let an unusually strong inertia event slip through and trigger a second navigation; the new gate is "no more navigations until wheel events go silent for 100ms," which absorbs any inertia tail no matter how long. Captured in §5.1 (Home — Interactions).
- **Project gallery: real-time free-scroll on touchpad, single-image step on mouse wheel.** Touchpad bursts drag the gallery's transform under the finger (clamped at both ends — a long backward swipe that reaches the first image stops there, it doesn't continue into the description snap on the same gesture). When the burst ends the gallery snaps to the nearest image. A single mouse-wheel click is still detected as a discrete event (via a ~30ms first-event buffer) and snaps exactly one image, same as before. Description-snap-back fires only on the FIRST event of a NEW gesture at the first image with a backward delta. Captured in §5.2 (Project page — Gallery section — Desktop).

**Changes from v1.8:**
- **Project page section order reversed.** The Description section is now the landing view; the Gallery section sits below it and is reached by scrolling down past the bottom of the description text. Snap transition direction inverts accordingly: forward (down) goes description → gallery; backward (up) at the first image goes gallery → description. The Line reveal animation on the description fires once on initial entry (no longer replays on each gallery↔description snap, per owner decision). Description scroll position is preserved across snaps; gallery resets to the first image when leaving. References updated in §2 (Animations → Snap transition) and §5.2 (Project page sections, entry, gallery section, description section).

**Changes from v1.7:**
- §4 slug migration: legacy hash URL redirects dropped from scope. Browsers don't send the URL fragment to the server, so a Netlify-side 301 can't intercept `/#morro` (only `/` ever arrives). Shared legacy links land on Home as-is. The slug migration map is retained as historical reference. `public/_redirects` no longer carries a Phase 12 TODO for hash redirects.
- §11 deployment plan: line "301 redirects for old hash URLs configured in `_redirects`" removed; no redirect file work remains for go-live.

**Changes from v1.6:**
- Project data model: `id` field removed. `slug` is now the sole identifier for a project. The Decap CMS schema (Phase 11) drops `id` from the form; `scripts/validate-data.js` no longer enforces the `id === slug` cross-check; existing `content/projects.json` had `id` stripped from all eight entries. No behavioural change — `id` was never read by the renderer.

**Changes from v1.5:**
- Back button visual changed from an arrow to an **X icon** on both the Project page and the Contact page. Position (bottom-right) and behavior (vertical sweep back to Home) unchanged. References updated in §2 and §5.2/§5.3.

**Changes from v1.4:**
- Captions in §2 redefined: shown below each gallery image (and below the expanded image in fullscreen), left-aligned with lower opacity. No more overlay-on-image with backdrop.
- §5.4 Image fullscreen redefined: a single shared expand/collapse animation that grows the clicked media from its gallery position to a centered ~90vw position with side margins, then shrinks it back on close. No image-to-image navigation while open; no separate desktop/mobile cover-vs-contain behavior. Only the X button (top-right) and Esc close.

**Changes from v1.3:**
- Appendix C location fields normalized to a single city (no compound "City A — City B" values). Three projects affected: MORRO (Mallorca — Berlin → Mallorca), TITLES (Girona — Mallorca → Girona), CONCERTS (Madrid — Berlin → Madrid). The first city in each former pair is retained. Lets the Home Info row's LOCATION column shrink, with consistent column positions across projects.

**Changes from v1.2:**
- Appendix C year fields normalized to a single (latest) year. Ranges like "2025–2026" become "2026" so the Info row's middle column has a consistent width and the description column doesn't shift between projects.

**Changes from v1.1:**
- New project list (8 projects, replaces 13 legacy projects) — see Appendix C.
- `link` / `linkText` fields replaced by `links` array (multiple links per project).
- Media items get optional `caption` field (per-image text overlay).
- Section 5.4 (Image fullscreen) rewritten — desktop behavior now full-viewport "Home-like" with horizontal sweep, mobile behavior unchanged from v1.1.
- Home Info row gets explicit responsive rule (single line ≥ 600px with adaptive sizing, stacks below).
- Gallery videos: autoplay when 90% visible in viewport, no controls.
- Phase 2 redefined: data is created from scratch (not migrated from legacy), with programmatically-generated placeholder media.

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
- Carousel / slideshow UI chrome (dot indicators, visible prev/next controls). *(Home covers do auto-advance on a 7-second timer — see §5.1 — but with no slideshow chrome; the "NEXT PROJECT" button is the only affordance and doubles as the countdown indicator.)*
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
- **"NEXT PROJECT" button** — bottom-right of the viewport (desktop/hover only). Advances to the next project on click, and its label doubles as the auto-advance countdown indicator (fills left-to-right over 7 s). See §5.1 "Auto-advance".

### Project page elements

**Static elements** — always visible, fixed position, do NOT move when scrolling:
- **Get in touch** link (top-right corner) — opens email client.
- **Info row** — bottom-left, showing RESULTS / LINKS / DURATION for the current project. The RESULTS cell shows the word "Gallery" as an interactive link that triggers the snap-to-gallery animation.
- **Back button** (top-right corner, beside Get in touch, X icon) — returns to Home via vertical sweep animation. While Image fullscreen is open it stays visible (everything else fades) and is repurposed to close the fullscreen instead, with its icon morphing to signal the change — see §5.4.

**Scrolling content** — changes as user scrolls vertically:
- **Description section** — top portion of the page, white background, long-form text. Lands first on entry.
- **Gallery section** — below the description, shows project media. Reached by scrolling past the bottom of the description.

### Captions
Small text shown directly below each image or video, **left-aligned** with **lower opacity** (~0.6) so it reads as a secondary label rather than a heading. Visible in both the Gallery section and the Image fullscreen state (where the caption sits below the centered, expanded media). Captions are per-media-item (each entry in `media[]` can have its own `caption` text). Optional and gracefully absent when empty — no placeholder, no blank space. Primarily used by category projects (TITLES, ARCHITECTURE, CONCERTS) to label individual pieces (e.g., artist name + venue for a concert photo).

### Image fullscreen
A state opened by clicking/tapping an image, video, or Figma prototype in the gallery. The clicked media animates from its gallery position to a centered, ~90vw expanded position; closing reverses the animation back to the gallery item. For a Figma prototype, the poster expands and the live interactive embed then loads over it.

### Animations
- **Horizontal sweep** — left/right wipe transition. Used between Home covers.
- **Vertical sweep** — up/down wipe transition. Used for navigation between Home and sub-pages:
  - Home → Project page: Project slides **down from top**.
  - Project page → Home: reverse (Project slides **up**, off the top).
  - Home → Contact: Contact slides **down from top**.
  - Contact → Home: reverse (Contact slides **up**, off the top).
- **Line reveal** — text-mask reveal animation. Each text line is wrapped in a clipped container; line starts translated 100% below its container, then slides up into view. Staggered delay between lines. Easing `cubic-bezier(.33, 1, .55, 1)`, duration ~0.55s per line. Used for entry of Project page (description text, Get in touch CTA) and Contact page text — identical to current live site for the initial paint, with one v1.12 enhancement: lines below the fold animate as the user scrolls them into the reading area (per-line scroll trigger via IntersectionObserver), instead of all firing on init. The trigger zone excludes the bottom 80px of the viewport (matching the chrome-mask band) so a scrolled-in line animates above the static-element area, and so the last line of a description still triggers when scrolled to the end.
- **Snap transition (Project page)** — when scrolling between the Description section (landing) and the Gallery section, the page snaps with a smooth animation. Both directions (description → gallery on a scroll-down past the bottom of the text; gallery → description on a scroll-up at the first image). Tunable post-build.
- **Home auto-advance** — the only *looping* timer on the site. The Home cover advances to the next project every 7 s via the standard Horizontal sweep, with the "NEXT PROJECT" button label acting as the countdown indicator. Full behaviour in §5.1. Two other elements are time-based but fire once, not on a loop, and are not auto-rotation: the Preloader intro sequence (once per session) and the "Email copied" toast (~2 s auto-dismiss). There is no crossfade anywhere.

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

**Slug migration map** (legacy hash URLs → new clean URLs):

Eight projects in the new portfolio. The new slugs are canonical; legacy hash URLs that map to a kept project redirect to the new slug. Legacy URLs for removed projects redirect to Home.

| New project | New URL | Redirected from |
|-------------|---------|-----------------|
| MORRO | `/morro` | `/#morro` |
| LUFTHANSA INNOVATION HUB | `/lufthansa-innovation-hub` | (new project, no legacy URL) |
| BUILD A ROCKET | `/build-a-rocket` | (new project, no legacy URL) |
| GESTIÓN REAVIVA | `/reaviva` | `/#gestion_reaviva` |
| FESTIVAL Z | `/festival-z` | `/#festivalz` |
| TITLES | `/titles` | `/#me_olvido`, `/#un_altre_peto` |
| ARCHITECTURE | `/architecture` | `/#binifaldo` |
| CONCERTS | `/concerts` | `/#gloosito`, `/#madison_beer`, `/#alequi`, `/#delaossa`, `/#maylaya`, `/#mda`, `/#coaatmca` |

The map is retained for historical reference only. **Legacy hash URLs are not redirected by the rebuild.** Browsers don't send a URL fragment (the `#…` part) to the server, so Netlify only ever sees `/` for any `/#x` request — there's no point of interception where a server-side 301 could fire. Every legacy hash link, mapped or not, lands the user on Home; from there they navigate to the right project the same way any first-time visitor would.

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
- **Open the current project:** click the **Project title**, or click (desktop) / tap (mobile) the **cover background**. Either triggers the vertical sweep to the project page (Project slides down from top). On mobile a cover **tap** is separated from a navigation **swipe** purely by pointer movement: under ~10px of travel = tap (opens the project); ~50px or more = swipe (previous / next project); the 10–50px band does nothing. The Role label and the Info row are **not** clickable for navigation.
- **Click logo "MORRO"** → no-op on Home (already there).
- **Click "Contact"** → navigate to Contact page via vertical sweep (Contact slides down from top).
- **Click "NEXT PROJECT" button** (bottom-right, desktop/hover only) → horizontal sweep to the next project. Same as a wheel/arrow "next".

**Auto-advance:**

Home cycles through the project covers on its own.

- **Cadence:** every **7 seconds** the cover advances to the next project via the standard Horizontal sweep. The order wraps: after the last project it returns to the first.
- **Indicator:** the **"NEXT PROJECT" button label** is the countdown. Its text fills from dim to bright, left-to-right, as the 7 s elapse; at full it fires the advance and the fill drains back.
- **Availability:** desktop only — shown when `(hover: hover)`, `(pointer: fine)` and viewport ≥ 600px. On touch / narrow viewports the button and the auto-advance are both absent; the user navigates manually.
- **Start:** the countdown does not begin until the Preloader has finished and the first cover is actually on screen (first visit). On a return visit within the session there is no preloader, so it starts immediately on load.
- **Pausing:**
  - Hovering the **"NEXT PROJECT" button** pauses the countdown and brightens the label; leaving resumes from where it was.
  - Hovering the **project title** freezes the countdown entirely (the user is likely about to click into the project); leaving resumes.
- **Manual navigation resets it:** any wheel / drag / arrow / button navigation drains the current fill and restarts the 7 s on the new project.

**State:**
- The current project index is remembered. If the user navigates to a Project page and back, Home returns to the cover of the project they were viewing — not project 0.
- URL stays at `/` regardless of which cover is showing. Browser back/forward affects navigation between Home/Project/Contact, but does NOT step through individual covers.

**Performance:**
- The cover image for the currently-shown project is loaded with `fetchpriority="high"`.
- The next and previous project covers are preloaded with `fetchpriority="low"`.
- All other covers are lazy-loaded.

**Info row responsive behavior:**

The Info row at the bottom of the viewport shows three columns: LOCATION / YEAR / DESCRIPTION. Content lengths vary significantly across projects (LOCATION can be 6–17 chars, DESCRIPTION can be 22–53 chars). The row must always look tidy at every screen size.

- **≥ 600px viewport width:** all three columns stay on a single line. Text size scales with available width using CSS `clamp()` (approximate ranges: label ~10–12px, value ~12–16px). Generous gaps between columns (~48px on desktop, scaling down). Minimum text size floor: **12px** for the value (to remain readable).
- **< 600px viewport width:** the three columns stack vertically (LOCATION → YEAR → DESCRIPTION on three rows). Text returns to a comfortable readable size; the row becomes taller but remains clean.

DESCRIPTION text never truncates with ellipsis — information is preserved. Long descriptions either fit (desktop) or get their own line below LOCATION + YEAR (mobile).

### 5.2 Project page

**Vertical structure:**
```
┌─────────────────────────────────────────────┐
│  [Get in touch ↗]              (static)      │
│                                              │
│            GALLERY SECTION                   │
│         (horizontal filmstrip)               │
│                                              │
│ [RESULTS  LINKS  DURATION]   [× back button] │  ← static, always visible
└─────────────────────────────────────────────┘
         ↓ scroll past last gallery image
┌─────────────────────────────────────────────┐
│  [Get in touch ↗]              (static)      │
│                                              │
│           DESCRIPTION SECTION                │
│         (white background, text)             │
│                                              │
│ [RESULTS  LINKS  DURATION]   [× back button] │  ← static, always visible
└─────────────────────────────────────────────┘
```

**Entry:**
- User clicks a project's title, or clicks/taps the cover background, on Home → vertical sweep (Project slides **down from top**). Page lands in the **Description section** at scroll position 0.
- Direct URL access (`/gestion-reaviva`) → page loads in the Description section, scroll position 0 (no sweep animation, but the Line reveal still applies to description text).
- On Project page entry, the description's **Line reveal** animation runs in two phases: lines on-screen at trigger time fire as a cascade waterfall (per-line staggered delay); lines below the fold are observed individually and each animates the moment it scrolls into the reading area. Neither phase replays on subsequent gallery↔description snaps.

**Static elements (do NOT move when scrolling):**
- Get in touch link — top-right.
- Info row (RESULTS / LINKS / DURATION) — bottom-left. The RESULTS cell shows `Gallery` as a clickable link that triggers the snap-to-gallery animation.
- Back button (X icon) — top-right, beside Get in touch.
- These are visible throughout both Gallery and Description sections, and — the back button only — through Image fullscreen too (repurposed there; see §5.4).
- Visual design and placement match the current live site exactly.

**Get in touch behavior:** Clicking the "Get in touch" link **copies the email address to the clipboard** (does NOT open a mail client) and shows a brief toast popup with the text "Email copied" which fades out automatically after ~2 seconds. The toast appears at the **center of the viewport** (horizontally and vertically centered).

**Gallery section — Desktop:**

- Images displayed in a single horizontal row, each at the **same fixed height** (`min(70vh, 50vw)`), width auto based on each image's aspect ratio. Very wide/panoramic images are the same height as all others and extend further to the right — there is no max-width cap. Breathing room above and below; does NOT fill viewport vertically.
- **Small consistent gap** between images: ~20px (final value tuned during build).
- Row extends off-screen to the right. The number of images visible at any moment depends on their individual widths — vertical/portrait images can result in more images visible initially than wider/landscape ones. There is no fixed cap on visible image count.
- **Navigation (desktop):**
  - **Scroll always controls the gallery regardless of cursor position.**
  - **Drag** anywhere in the gallery also moves it horizontally.
  - **No arrow buttons on desktop.** Arrow keys on the keyboard also do NOT navigate the gallery in the regular view — they only function in Image fullscreen.
- **Scroll behavior:**
  - **Touchpad swipes** drive the gallery transform in real time (free scroll). When the user releases, the gallery stays wherever they left it — no snap to the nearest image. Clamped at both ends: a long swipe from the last image back to the first stops at the first image, and does not continue into the Description snap on the same gesture.
  - **Mouse-wheel clicks** are detected as discrete events and snap exactly one image per click. After a free-scrolled touchpad swipe, a mouse click steps to the actual next/previous image relative to the current scroll position, not the last snapped image.
  - The two are distinguished automatically (a ~30ms buffer on the first event of a gesture decides between them based on whether a follow-up arrives).
- **Click an image** → opens Image fullscreen.
- **Snap positions:** image 1 is left-aligned (left edge at `--page-pad-x`); images 2..N-1 snap centred to the viewport's horizontal middle; the last image is right-aligned (right edge at `--page-pad-x` from the viewport right), mirroring image 1.
- **At the first image, scrolling backward** → triggers the **Snap transition** back to the Description section, which lands at whatever scroll position the user was at before entering the gallery. The forward direction (scrolling down at the bottom of the Description section) → Snap transition into the Gallery section, landing on the first image. The gallery resets to the first image when the user snaps back, so re-entering the gallery always starts fresh.
- **Videos in gallery:** play muted, loop, **no controls visible**. Each video **autoplays when at least 90% of the video is visible in the viewport** (intersection observer with `threshold: 0.9`); pauses when less than 90% is visible. Click to open in Image fullscreen (where full HTML5 controls become available).

- **Figma prototypes in gallery** (`type: "figma"`): render as the item's `poster` still (required) with a small "Prototype" label at bottom-left. The prototype does **not** run inline in the filmstrip. Click/tap opens Image fullscreen, where the live interactive prototype loads (see §5.4). The poster's aspect ratio (or an explicit `aspect` value) sets the item's shape.

- **Captions:** each media item in the gallery (image or video) can have an optional caption. When present, the caption appears as small overlay text positioned at the **bottom-left** of the media item, white text with a subtle backdrop for legibility. When the caption is empty or absent, nothing renders (no placeholder, no blank space).

**Gallery section — Mobile:**

- Images in a single horizontal row.
- All images at the **same fixed height**, with natural widths (different per image).
- Breathing room above and below the row.
- **Horizontal swipe** = navigate between images.
- **Vertical swipe down at the first image** = triggers the **Snap transition** back to the Description section.
- **Arrow buttons** visible on mobile (small, tappable, positioned for thumb reach) — navigate previous/next image.
- **Tap an image** → opens Image fullscreen.

**Description section:**

- Long-form `longDescription` text laid out as the landing view of the Project page.
- Static elements (Get in touch, Info row, Back button) remain visible.
- Vertical scroll moves through the text natively.
- Scrolling down at the bottom of the text → **Snap transition** forward into the Gallery section, landing on the first image.
- The description's scroll position is preserved across snaps — if the user scrolled to the bottom, went to the gallery, and came back, they return to the bottom (not the top).

**Exit:**
- Click back button → vertical sweep back to Home (Project slides **up**, off the top — reverse of entry).
- Click MORRO logo → same as back button: vertical sweep back to Home (Project slides up).
- Click Get in touch → copies the email address to clipboard and shows the "Email copied" toast (no navigation).
- Browser back button → returns to the previous page in history (Home, in normal flow).

### 5.3 Contact page

**Behavior:** Identical to the current live site. No structural changes — only the same code quality and performance improvements applied to the rest of the site. Text elements use the Line reveal animation: visible lines fire as the cascade waterfall on entry (same as current site), and any lines that overflow off-screen on small viewports are scroll-triggered per-line as the user brings them into view.

**Get in touch link:** copies email to clipboard + shows "Email copied" toast (same behavior as on Project pages).

**Entry from Home:** vertical sweep, Contact slides **down from the top**.
**Exit to Home:** reverse — Contact slides **up**, off the top.

### 5.4 Image fullscreen

Triggered by clicking/tapping an image or video in the Project page Gallery. Behavior is identical on desktop and mobile.

**The expand animation:**

- The clicked media animates from its current gallery position to a centered "expanded" position in the viewport.
- Expanded size: **~90vw wide** (with ~5vw side margins) when the aspect ratio allows; capped in height to leave room for the X close button (top-right) and the caption (below the image). Aspect ratio is preserved (`object-fit: contain`).
- While fullscreen is open, **all other project page elements are hidden** — header logo, Get in touch link, info row, chrome masks, and the gallery itself — **except the back button**, which stays visible in place, is lifted above the fullscreen layer, and is repurposed as the close control (see "Triggers to close" and the icon-morph note below). Only the expanded media, its caption (if any), and the back button (now doubling as the fullscreen X) are visible.
- Closing reverses the animation: the media shrinks back to its original gallery position and the project page elements reappear.

**No in-fullscreen navigation:** to view another image the user closes the current fullscreen and clicks a different gallery item. There is no arrow / swipe / wheel navigation between media items while fullscreen is open.

**Triggers to close:**

- Click the back button (top-right) — while fullscreen is open this closes the fullscreen instead of navigating Home.
- Click the backdrop (empty area outside the media).
- Press Esc.

**Back-button icon morph:** on open, the back button's X animates — a true point-by-point geometry morph, not a cross-fade — into two small diagonal arrows pointing at each other on the same diagonal (a "compress" glyph), signalling it now closes the media rather than leaving the page. Reverses on close. ~620ms, quintic ease-in-out, respects `prefers-reduced-motion` (jumps to the end state instead of animating). Its `aria-label` swaps between "Back to home" and "Close full-screen view" to match.

**Caption in fullscreen:**

- Caption appears below the expanded image, left-aligned, low opacity — same styling as in the Gallery section.
- Hidden when empty.

**Video behavior in fullscreen:**

- Full HTML5 controls visible (play / pause / scrub / volume / fullscreen). User can interact normally with the video.
- Autoplays on entry, with sound when the browser allows it. If the browser blocks sound-on-autoplay, the video starts muted and the user can unmute with the visible controls.
- Click the back button, click the backdrop, or press Esc to close.

**Figma prototype behavior in fullscreen:**

- The poster still expands first (identical to an image). Once the expand animation settles, a live Figma `<iframe>` is mounted over the poster and fades in when it loads. The prototype is fully interactive — click through it normally.
- Built from the stored `url` via Figma's `embed.figma.com` endpoint (`embed-host=menendezmorro`); a pasted full `<iframe>` snippet or `embed.figma.com` link is accepted too. The Figma file must be shared "Anyone with the link → can view" or visitors see a Figma login wall.
- **Close:** click the back button (top-right, above the iframe — the reliable option), click the backdrop, or press Esc when focus is not inside the prototype iframe. Closing removes the iframe so the Figma viewer stops. Note: once focus is inside the cross-origin iframe, Esc is captured by Figma instead of reaching the page — the back button and backdrop click are unaffected by that, since Figma can't intercept a click landing outside its own iframe.
- Frame size follows the poster's aspect ratio, or the media item's `aspect` override (`"16:9"`, `"9:16"`, …).

### 5.5 Password-protected projects

Any project can be marked `protected` with a `password` (set through the CMS). It changes nothing about the URL or navigation — clicking the project from Home still goes to `/<slug>` with the normal vertical sweep — only what that page shows before (and after) the password is entered.

**What this is, plainly:** a soft gate for casual visitors — an accidental link, idle browsing, a search hit — the same kind of thing Cargo/Format/Squarespace's own "password protected page" features do. **It is not real access control.** The site has no server, so nothing here can be enforced the way an actual login would be; a visitor determined enough to look for the real content in a network request could still find it. What it *does* guarantee (see "What's actually protected" below) is that the real content isn't sitting in the page's initial source the way a purely cosmetic lock screen's would be — passing the gate is the only path a normal visitor has to it.

**On the Home page:** a protected project's title carries a small lock badge (to the right of the title, same row). The cover image itself is unaffected — only the project's own page is gated.

**Entering the project page (locked):**
- All the normal project-page chrome — Get in touch, the info row, the gallery, the description — is absent. Logo and back arrow (X) are the only chrome shown, both recolored white for the screen's blue background; the back arrow keeps its normal "go Home" behavior (there's no fullscreen state to repurpose it for here).
- Layout: a horizontal row, vertically centered — password fields (left) — a hangman illustration (center) — status text, "Password protected" (right). On mobile: hangman + fields centered as a stacked block; status text centered at the bottom. Logo top-left, X top-right, both at their normal size/position (mobile included — deliberately not hidden the way the ordinary project page hides its logo on mobile).
- **Password entry is live, per character, not "type it all and submit."** Each keystroke is checked immediately against the correct character at that position. A wrong character is rejected outright — never inserted — so the field always shows a true, correct prefix of the password; the field row also plays a brief wiggle. A correct character appears in the field (uppercased) and the entry advances.
- **Hangman:** 1 base "structure" stage (always shown) + 6 miss stages (head, body, left arm, right arm, left leg, right leg), one revealed per wrong character. On the 6th miss, status text changes to "Incorrect password," a 2s pause, then the same reverse sweep as the X/Esc takes the visitor back to Home.
- **Success:** once every character has been entered correctly, the gate is replaced by the real project (gallery, description, links, the usual chrome) via the same reveal used elsewhere on the site — no separate "submit" step.
- **Remembered for the session:** once unlocked, revisiting the same project's URL in the same browser tab skips straight to the real content (no gate) for the rest of that browsing session. Closing the tab clears it.

**What's actually protected:** the project's gallery, long description, and links are never included in `window.__SITE_DATA__` — not on the project's own page, not on Home, not on any other project's page — the way every other field is. They're written instead to their own small static file, fetched only after the password check passes. This is the meaningful difference from a "gate that's just a UI overlay": on a purely cosmetic lock screen, the real content is already sitting in that same page's source, readable by anyone who looks, whether or not they ever see the lock. Here it genuinely is not — reaching it requires passing the gate (or directly guessing the fetch URL, which is not meaningfully harder than guessing the password itself, so it isn't treated as a materially different risk).

**Performance — this must never cost anything on a non-protected page:**
- The gate's interactivity (`password-gate.js`) is loaded via a dynamic `import()`, executed only when the current project is protected. On every other project page that `import()` line never runs, so the file is never requested.
- The hangman artwork is one small inline sprite (all 7 stages combined, no separate requests), and — like the gate's stylesheet — is only present at all in the built HTML of a protected project's own page.
- Hashing uses the browser's native Web Crypto API and Node's built-in `crypto` module at build time — no new runtime or dev dependency either way.

### Data model additions (see also §6.1)

- `protected` (boolean) and `password` (plain string) on a project, both optional. `password` is required when `protected` is true (enforced by `scripts/validate-data.js`).
- The plaintext password exists only in `content/projects.json` (repo-side) and inside the Node build process — `scripts/build.js` never writes it to any built output. What ships instead: `passwordLength` (the character count — not a secret, needed to render the right number of fields) and `passwordCharHashes` (one SHA-256 hex digest per character position, salted with that position — `sha256("<index>:<UPPERCASE CHAR>")` — so the client can validate each keystroke live without ever holding the real password).
- The gated fields (`media`, `longDescription`, `links`) are written to `assets/protected/<slug>.json` in the published site instead of being inlined anywhere.

---

## 6. Data model

### 6.1 `projects.json` structure

```json
{
  "projects": [
    {
      "slug": "morro",
      "title": "MORRO",
      "role": "Branding and Art Direction",
      "year": "2026",
      "location": "Mallorca — Berlin",
      "type": "design",
      "subcategory": [],
      "description": "Digital design studio.",
      "longDescription": "Branding and art direction for MORRO...\n\nThe goal was...",
      "links": [
        { "url": "https://www.instagram.com/uepmorro/", "text": "@uepmorro" }
      ],
      "duration": "1 month",
      "cover": "assets/media/morro/morro-cover.jpg",
      "coverAlt": "MORRO cover",
      "media": [
        { "type": "image", "src": "assets/media/morro/morro-1.jpg", "alt": "MORRO image 1", "caption": "" },
        { "type": "image", "src": "assets/media/morro/morro-2.jpg", "alt": "MORRO image 2", "caption": "" },
        { "type": "video", "src": "assets/media/morro/morro-3.mp4", "poster": "assets/media/morro/morro-3.jpg", "caption": "" },
        { "type": "figma", "url": "https://www.figma.com/proto/ABC123/Prototype?node-id=1-2", "poster": "assets/media/morro/morro-4.jpg", "alt": "MORRO prototype", "caption": "", "aspect": "16:9" }
      ]
    }
  ]
}
```

**Field notes:**
- `slug` is the URL path and the project's identifier in the data model.
- `type`: either `"design"` or `"photo"`. Unused in UI but preserved for future filtering.
- `subcategory`: always an array. Currently unused in UI; preserved for future filtering. Empty arrays are valid.
- `links`: array of `{url, text}` objects. Can be empty (`[]`) for projects with no external links — the UI hides the LINKS section in that case. Can have multiple entries for projects with several relevant links (e.g., TITLES, CONCERTS).
- `cover`: optional path to the home page cover image (e.g. `assets/media/morro/morro-cover.jpg`). When absent, the renderer falls back to `media[0]`. Naming convention: `<slug>-cover.jpg` — the optimizer detects this suffix and applies cover-specific settings (quality 85, desktop max 2560px).
- `coverAlt`: optional alt text for the cover image. Falls back to `<Project title> cover` when absent.
- `media[0]` is the **first gallery image** — it is no longer the home cover.
- `media[].alt` text: required for accessibility. Auto-generated as `<Project title> image N` if not provided in CMS.
- `media[].caption`: optional. Per-image overlay text shown at bottom-left in Gallery and Image fullscreen. Empty/absent → no overlay rendered.
- Videos: `poster` is optional but recommended (used as fallback if video fails to load).
- `protected` (optional boolean) + `password` (optional string, required when `protected` is true) — see §5.5. `password` is plain text only in this file (repo-side, never shipped as-is) — the build hashes it per character before anything reaches a browser.
- **`type: "figma"`** (Figma prototype embed) uses a different field set:
  - `url` (**required**) — the Figma share link (`https://www.figma.com/proto/…`), an `embed.figma.com` link, or a full `<iframe …>` embed snippet. The renderer normalises all three. `/proto/` links give a clickable prototype; `/design/` or `/file/` links embed a static canvas (validator warns).
  - `poster` (**required**) — still image shown in the filmstrip; its aspect ratio also sizes the fullscreen frame.
  - `alt` (**required**), `caption` (optional) — as above.
  - `aspect` (optional) — `"W:H"` (e.g. `"16:9"`, `"9:16"`) or a bare decimal; overrides the poster's aspect ratio for the fullscreen frame only.
  - `src` is **not** used for this type.
  - The Figma file must be shared "Anyone with the link → can view".

### 6.2 `site.json` structure (new file — site-wide settings)

```json
{
  "siteTitle": "MORRO",
  "siteDescription": "Portfolio of design and photography projects by Martí Menéndez.",
  "siteUrl": "https://menendezmorro.com",
  "ogImage": "assets/og-image.jpg",
  "contactEmail": "martimm99@gmail.com",
  "contactCopy": [
    "MORRO is a design portfolio...",
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
- Year (text, required) — a single year (e.g., "2026"). Ranges are no longer used; pick the latest year of work on the project.
- Location (text) — a single city (e.g., "Madrid"). Compound "City A — City B" values are no longer used; pick the primary city of the project.
- Type (select: design / photo)
- Subcategory (multi-select: branding, web, titles, architecture, live — preserved for future filtering; UI not exposed in v1.2)
- Short description (text, shown in Home Info row)
- Long description (markdown, shown on Project page)
- **Links** (list, drag-to-reorder, can be empty):
  - URL (URL, required if entry present)
  - Display text (text, required if entry present)
- Duration (text)
- Cost (text)
- Password protected (boolean, optional, default off) — see §5.5
- Password (text, optional) — only used when "Password protected" is on. Plain text in the CMS; hashed at build time, never shipped as entered.
- **Media** (list, drag-to-reorder):
  - Type (select: image / video / Prototype (Figma))
  - File (image or video upload) — image / video only
  - Figma link (text) — prototype only: share link or full embed code
  - Alt text (text, for accessibility)
  - Caption (text, optional) — shown as overlay at bottom-left in Gallery and fullscreen
  - Poster (image upload) — optional for video; **required** for a Figma prototype (shown in the gallery + sizes the fullscreen frame)
  - Prototype aspect ratio (text, optional) — prototype only, e.g. `16:9` / `9:16`

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
| Largest single gallery image served | < 300 KB | Via WebP + responsive sizes; high-detail photography may exceed this |
| Total media folder size (source files) | ≤ current 56MB | Won't fight this; optimization happens at serving, not source |

**Optimization techniques used:**
- WebP format for all images, with JPEG fallback via `<picture>`.
- Two responsive variants per image: `mobile` (max 1536px — covers 3× retina phones at the 768px breakpoint) and `desktop` (max 1920px for gallery images, max 2560px for cover images). Mobile variant skipped when source width ≤ 1536px.
- Cover images (`<slug>-cover.jpg`) use WebP quality 85 and a 2560px desktop cap. Gallery images use quality 80 and a 1920px desktop cap. The optimizer detects covers by the `-cover` filename suffix.
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
- Home auto-advance (§5.1) currently has no explicit pause control and does not stop under `prefers-reduced-motion` — an open WCAG 2.2.2 gap tracked in Appendix A.

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
| 7 | Project page — Description section + static elements | Description, Get in touch link, info row, back button, transition between gallery and description | Medium |
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
- **Home auto-advance accessibility (§5.1).** As shipped, the 7-second auto-advance has no dedicated pause/stop control (only the button- and title-hover pauses) and is not suppressed under `prefers-reduced-motion`. WCAG 2.2.2 (Pause, Stop, Hide) would want an explicit control or an auto-stop. Deferred — revisit whether to add a persistent pause affordance and/or halt auto-advance for reduced-motion users. It is desktop/hover-only, which limits exposure.

## Appendix B: Decisions deliberately deferred to future versions

- Typography change (kept current fonts as placeholder).
- About / Blog / CV sections.
- Plausible or other privacy-friendly analytics replacement.
- Filtering UI re-introduction.
- Image optimization automation via GitHub Actions.

## Appendix C: Initial project list (v1.2)

Eight projects, in Home display order (first to last as the user scrolls forward).

For each project, all metadata fields are listed. Long descriptions are deliberately omitted in this spec — they will be authored directly via the Decap CMS once the site is live. Media files are placeholder (programmatically generated in Phase 2) until owner provides finals via CMS.

### 1. MORRO
- **Slug:** `morro`
- **Type:** `design`
- **Role:** Branding and Art Direction
- **Year:** 2026
- **Location:** Mallorca
- **Short description:** Digital design studio.
- **Links:** `[{ url: "https://www.instagram.com/uepmorro/", text: "@uepmorro" }]`
- **Duration:** 1 month

### 2. LUFTHANSA INNOVATION HUB
- **Slug:** `lufthansa-innovation-hub`
- **Type:** `design`
- **Role:** Graphic Design & Motion Graphics
- **Year:** 2026
- **Location:** Berlin
- **Short description:** Digital solutions for the next in travel and mobility.
- **Links:** `[{ url: "https://lh-innovationhub.de/en/", text: "Website" }]`
- **Duration:** 9 months

### 3. BUILD A ROCKET
- **Slug:** `build-a-rocket`
- **Type:** `design`
- **Role:** Web Design
- **Year:** 2026
- **Location:** Berlin
- **Short description:** Full-service gaming agency.
- **Links:** `[{ url: "https://buildarocket.com/en", text: "Website" }]`
- **Duration:** 3.5 months

### 4. GESTIÓN REAVIVA
- **Slug:** `reaviva`
- **Type:** `design`
- **Role:** Branding and Web Design & Development
- **Year:** 2025
- **Location:** Mallorca
- **Short description:** Technical services for construction projects.
- **Links:** `[{ url: "https://www.gestionreaviva.com/", text: "Website" }]`
- **Duration:** 3 months

### 5. FESTIVAL Z
- **Slug:** `festival-z`
- **Type:** `design`
- **Role:** Creative Direction
- **Year:** 2026
- **Location:** Girona
- **Short description:** Performing arts festival.
- **Links:** `[{ url: "https://www.festivalz.org/en/", text: "Website" }]`
- **Duration:** 5 months

### 6. TITLES
- **Slug:** `titles`
- **Type:** `design`
- **Role:** Graphic Design
- **Year:** 2023
- **Location:** Girona
- **Short description:** Titles design for audiovisual projects.
- **Links:** `[{ url: "https://www.youtube.com/watch?v=D46HaA131vU", text: "Un altre petó" }, { url: "https://www.youtube.com/watch?v=SzteXtJIies", text: "Me Olvido" }]`
- **Duration:** 2 weeks
- **Notes:** Category project — per-media captions expected (e.g., title sequence names).

### 7. ARCHITECTURE
- **Slug:** `architecture`
- **Type:** `photo`
- **Role:** Photography and Postproduction
- **Year:** 2026
- **Location:** Mallorca
- **Short description:** Photography service for real estate agencies.
- **Links:** `[]` (none)
- **Duration:** 2–5 days
- **Notes:** Category project — per-media captions expected (e.g., property names, locations).

### 8. CONCERTS
- **Slug:** `concerts`
- **Type:** `photo`
- **Role:** Photography and Postproduction
- **Year:** 2026
- **Location:** Madrid
- **Short description:** Concert photography for artists, labels and media.
- **Links:** `[{ url: "https://fleek.25gramos.com/live_show/live-show-w-gloosito/", text: "25Gramos" }]`
- **Duration:** 3 days
- **Notes:** Category project — per-media captions expected (e.g., artist + venue + year).

## Appendix D: Phase 2 placeholder media strategy

During Phase 2, programmatically-generated placeholder images are created in `assets/media/<slug>/` for each project to allow Phases 5–10 to render visually meaningful results.

**Generation rules:**
- Use `sharp` (already a dev dependency) to compose images.
- Per project, generate 4 placeholders with varied aspect ratios:
  - `<slug>-1.jpg` — 1920×1080 landscape (cover)
  - `<slug>-2.jpg` — 1080×1920 vertical
  - `<slug>-3.jpg` — 1080×1080 square
  - `<slug>-4.jpg` — 2400×1000 wide
- Each placeholder: solid dark background (#1a1a1a), the project title centered in light gray text (#aaaaaa), with the image index (e.g., "1 / 4") below in smaller text.
- File size target: under 60 KB per placeholder.

**Lifecycle:** placeholders are committed to git so the site is testable end-to-end immediately. They will be progressively replaced by real media via the Decap CMS once final images and videos are ready. The owner does not need to provide placeholder images at any point.
