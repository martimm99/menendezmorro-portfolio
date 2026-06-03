/**
 * project.js — Project page entry.
 *
 * Resolves the URL slug to a project, updates document head metadata,
 * renders the static chrome (Get in touch, info row, back arrow), wires
 * the gallery, populates the description section, and orchestrates the
 * snap transition between gallery and description.
 *
 * Per BUILD_SPEC.md §5.2:
 *   - Click "Get in touch" copies the contact email to the clipboard and
 *     shows a centered "Email copied" toast that fades after ~2s.
 *   - Back arrow and the page logo both return to / (Phase 10 will swap
 *     the full reload for a vertical sweep).
 *   - Info row shows LINKS / DURATION / COST. The LINKS cell hides when
 *     project.links is empty (per spec §6.1).
 *   - Long description text appears in the Description section with the
 *     Line reveal animation when the section first becomes visible.
 *   - Snap to Description: wheel forward at the end of the gallery, or
 *     vertical swipe up on mobile.
 *   - Snap back: wheel up at the top of description's scroll, or vertical
 *     swipe down on mobile.
 *
 * An unknown slug silently redirects to / so a typo lands somewhere
 * sensible instead of throwing.
 */

import { initGallery, pickAxis } from './gallery.js';
import { initFullscreen, openFullscreen } from './fullscreen.js';
import {
  copyText,
  showToast,
  escapeHtml,
  prefersReducedMotion,
  wrapTextInRevealLines,
  assignRevealLineDelays,
  arrivedViaViewTransition,
  forceRevealAndNavigate
} from './utils.js';

const SNAP_DURATION_MS = 1000;
const LINE_REVEAL_DELAY_PER_LINE_MS = 80;
const DESCRIPTION_REVEAL_DELAY_DIRECT_MS = 60;
const DESCRIPTION_REVEAL_DELAY_AFTER_SWEEP_MS = 1100;

let teardown = null;
// v1.8: section order is description-then-gallery. showGallery tracks
// whether the gallery overlay is currently on top of the description.
// Initial false = description is what the user sees on landing.
let snapState = { showGallery: false, isAnimating: false };
let touchStart = null;

export function initProject(data, slug) {
  const project = data.projects.find((p) => p.slug === slug);
  if (!project) {
    window.history.replaceState(null, '', '/');
    window.dispatchEvent(new CustomEvent('route-change', { detail: { url: '/' } }));
    return;
  }

  // Remember this project so the Home cover lands on it when the user
  // navigates back (and not on the first project every time). Stored
  // per-tab via sessionStorage; cleared automatically when the tab is
  // closed.
  try { sessionStorage.setItem('lastProjectSlug', slug); } catch {}

  updateHead(data.site, project);
  renderInfoRow(project);
  renderDescription(project);
  setupNavigation(data.site);
  initFullscreen();
  triggerDescriptionReveal();

  const galleryAPI = initGallery({
    items: project.media,
    projectTitle: project.title,
    gallery: document.querySelector('[data-gallery]'),
    track: document.querySelector('[data-gallery-track]'),
    prevBtn: document.querySelector('[data-gallery-prev]'),
    nextBtn: document.querySelector('[data-gallery-next]'),
    onItemActivate: (index) => {
      // Open the fullscreen state for the clicked gallery item. We
      // re-query the DOM here because gallery.js owns the item list and
      // the click handler passes only the index.
      const item = document.querySelectorAll('.gallery-item')[index];
      if (item) openFullscreen(item);
    }
  });

  // Single wheel + touch listener owns both the gallery stepping and
  // the description snap-back. See setupWheelAndSnap for why this is
  // one handler instead of two.
  setupWheelAndSnap(galleryAPI);

  teardown = galleryAPI;
}

/* ---------- Head metadata ---------- */

function updateHead(site, project) {
  const pageTitle = `${project.title} — ${site.siteTitle}`;
  const pageDescription = project.description || site.siteDescription;
  const pageUrl = `${site.siteUrl}/${project.slug}`;
  // First media item as the social-preview image. Falls back to the
  // site-wide OG image if a project has no media (shouldn't happen
  // per validator, but be defensive).
  const firstMedia = (project.media || []).find((m) => m && m.src);
  const projectImage = firstMedia
    ? `${site.siteUrl}/${String(firstMedia.src).replace(/^\//, '')}`
    : `${site.siteUrl}/${String(site.ogImage || '').replace(/^\//, '')}`;

  document.title = pageTitle;
  setMeta('meta[name="description"]',           'content', pageDescription);
  setMeta('link[rel="canonical"]',              'href',    pageUrl);
  setMeta('meta[property="og:title"]',          'content', pageTitle);
  setMeta('meta[property="og:description"]',    'content', pageDescription);
  setMeta('meta[property="og:url"]',            'content', pageUrl);
  setMeta('meta[property="og:image"]',          'content', projectImage);
  setMeta('meta[name="twitter:title"]',         'content', pageTitle);
  setMeta('meta[name="twitter:description"]',   'content', pageDescription);
  setMeta('meta[name="twitter:image"]',         'content', projectImage);

  injectStructuredData(site, project, pageUrl, projectImage);
}

function setMeta(selector, attr, value) {
  const el = document.querySelector(selector);
  if (el) el.setAttribute(attr, value);
}

// Inject a JSON-LD CreativeWork block describing the project, per
// BUILD_SPEC §10 (SEO baseline). The block lives in <head> so search
// crawlers and Open Graph parsers pick it up alongside the meta tags.
function injectStructuredData(site, project, url, image) {
  const existing = document.head.querySelector('script[type="application/ld+json"][data-project-ld]');
  if (existing) existing.remove();

  const data = {
    '@context': 'https://schema.org',
    '@type': 'CreativeWork',
    name: project.title,
    headline: project.title,
    description: project.description || site.siteDescription,
    url,
    image,
    inLanguage: 'en',
    creator: {
      '@type': 'Person',
      name: 'Martí Menéndez'
    }
  };
  if (project.year)     data.dateCreated = String(project.year);
  if (project.location) data.locationCreated = { '@type': 'Place', name: project.location };

  const tag = document.createElement('script');
  tag.type = 'application/ld+json';
  tag.dataset.projectLd = '';
  tag.textContent = JSON.stringify(data);
  document.head.appendChild(tag);
}

/* ---------- Static info row ---------- */

function renderInfoRow(project) {
  const linksCell = document.querySelector('[data-info-cell="links"]');
  const linksSlot = document.querySelector('[data-info-links]');
  if (linksCell && linksSlot) {
    if (project.links && project.links.length > 0) {
      linksCell.hidden = false;
      linksSlot.innerHTML = project.links
        .map((l) => `<a href="${encodeURI(l.url)}" target="_blank" rel="noopener">${escapeHtml(l.text)}</a>`)
        .join('');
    } else {
      linksCell.hidden = true;
    }
  }
  const durationSlot = document.querySelector('[data-info-duration]');
  if (durationSlot) durationSlot.textContent = project.duration || '';
  const costSlot = document.querySelector('[data-info-cost]');
  if (costSlot) costSlot.textContent = project.cost || '';
}

/* ---------- Description content ---------- */

function renderDescription(project) {
  const container = document.querySelector('[data-description-content]');
  if (!container) return;

  // Spec Appendix C: long descriptions are CMS-authored and currently
  // empty in projects.json. Until the CMS lands, fall back to a clearly-
  // labeled placeholder so the section is visible.
  const text = project.longDescription
    || `${project.description}\n\nLong description coming soon — to be authored via the Decap CMS.`;

  // Spec §2 Line reveal: each text line is wrapped in a clipped container
  // whose contents start translated 100% below and slide up. To get the
  // line-by-line effect without manually splitting at line breaks (which
  // depend on font metrics, container width, etc.), we wrap each word in
  // .reveal-line-clip > .reveal-line, then measure each word's top after
  // layout and assign one --reveal-delay per visual line — so all words on
  // the same line animate together.
  const paragraphs = text.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  container.innerHTML = paragraphs
    .map((p) => `<p class="description-paragraph">${wrapTextInRevealLines(p)}</p>`)
    .join('');

  // Two rAFs: the first ensures the new innerHTML is committed, the second
  // ensures layout has settled so getBoundingClientRect reflects the final
  // wrapping. All reveal-lines share the same transform here, so their
  // relative tops still cluster correctly per visual line.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => assignRevealLineDelays(container, LINE_REVEAL_DELAY_PER_LINE_MS));
  });
}

/* The description is the landing section (v1.8 reversed the section
 * order). Its per-word line reveal fires once, on initial entrance,
 * timed against the cross-document VT sweep (if any). After that the
 * description text stays revealed for the rest of the visit — going
 * to the gallery overlay and coming back doesn't replay the reveal,
 * per owner decision. */
function triggerDescriptionReveal() {
  const container = document.querySelector('[data-description-content]');
  if (!container) return;
  const delay = prefersReducedMotion()
    ? 0
    : (arrivedViaViewTransition()
        ? DESCRIPTION_REVEAL_DELAY_AFTER_SWEEP_MS
        : DESCRIPTION_REVEAL_DELAY_DIRECT_MS);
  setTimeout(() => container.classList.add('reveal-in'), delay);
}

/* ---------- Navigation + chrome wiring ---------- */

function setupNavigation(site) {
  // Logo and back arrow both return to Home via cross-document view
  // transition (the @view-transition rule in base.css handles the
  // vertical sweep). Before navigating we force every reveal target
  // into its fully-visible state via .reveal-snap on body, so the
  // OLD snapshot the VT captures has the page fully revealed even
  // if the user clicks before the natural reveal animation finished.
  document.querySelectorAll('[data-nav-home]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      forceRevealAndNavigate('/');
    });
  });

  // Get in touch: copy email + toast.
  const getInTouch = document.querySelector('[data-action-copy-email]');
  if (getInTouch && site.contactEmail) {
    getInTouch.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        const ok = await copyText(site.contactEmail);
        if (ok) {
          showToast('Email copied');
        } else {
          window.location.href = `mailto:${site.contactEmail}`;
        }
      } catch {
        window.location.href = `mailto:${site.contactEmail}`;
      }
    });
  }
}

/* ---------- Wheel + touch + snap ----------
 *
 * v1.8 reversed the section order: description is the landing
 * section, gallery is the overlay that slides up from below to
 * cover it. So the navigation reads:
 *
 *   forward (wheel-down / swipe-up at bottom of description):
 *     description → gallery (snapToGallery)
 *   backward (wheel-up / swipe-down at first image of gallery):
 *     gallery → description (snapToDescription)
 *
 * One window-level wheel listener owns both the gallery's per-
 * image stepping and the section snap, with an action-cooldown
 * throttle (mirrors home.js's wheel handler). Inertia events
 * landing inside the cooldown window are dropped without
 * extending it, so a follow-up swipe inside the inertia tail
 * isn't treated as continuation. The snapState.isAnimating gate
 * handles the in-flight 1s snap on top of that.
 *
 * passive: true: gallery scrolls via CSS transform (no native
 * scroll container to preventDefault on), and the description's
 * edge bounce is contained by overscroll-behavior-y: contain in
 * project.css. AT_BOTTOM_THRESHOLD tolerates sub-pixel
 * scrollTop values macOS browsers sometimes leave after smooth
 * scrolls.
 */
function setupWheelAndSnap(galleryAPI) {
  const descriptionSection = document.querySelector('[data-section-description]');
  if (!descriptionSection) return;

  // 700ms outlasts a typical touchpad inertia tail so one swipe
  // = one image step. Matches home.js and the previous project
  // gallery setup.
  const STEP_COOLDOWN_MS = 700;
  const AT_EDGE_THRESHOLD = 1;
  let lastActionAt = 0;

  function descriptionAtBottom() {
    return descriptionSection.scrollTop + descriptionSection.clientHeight
      >= descriptionSection.scrollHeight - AT_EDGE_THRESHOLD;
  }

  window.addEventListener('wheel', (e) => {
    if (snapState.isAnimating) return;
    if (e.timeStamp - lastActionAt < STEP_COOLDOWN_MS) return;

    const delta = pickAxis(e.deltaX, e.deltaY);
    if (delta === 0) return;

    if (snapState.showGallery) {
      // Gallery overlay is on top. Step images on each gesture;
      // a backward swipe at the first image snaps back down to
      // the description.
      const result = galleryAPI.step(delta);
      if (result === 'stepped') {
        lastActionAt = e.timeStamp;
      } else if (result === 'at-start' && delta < 0) {
        snapToDescription();
      }
    } else {
      // Description is showing. Native scroll handles wheel
      // events anywhere inside the description that isn't at
      // the very bottom. A forward (down) wheel landing while
      // already at the bottom snaps up to the gallery.
      if (!descriptionAtBottom()) return;
      if (e.deltaY <= 0) return;
      snapToGallery();
    }
  }, { passive: true });

  // Mobile vertical swipe — listen on document so a swipe that starts
  // over a static element (info row, back arrow, header logo) still
  // triggers the snap.
  document.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, { passive: true });

  document.addEventListener('touchend', (e) => {
    if (!touchStart || snapState.isAnimating) { touchStart = null; return; }
    const end = e.changedTouches[0];
    if (!end) { touchStart = null; return; }
    const dx = end.clientX - touchStart.x;
    const dy = end.clientY - touchStart.y;
    touchStart = null;
    // Vertical swipe must dominate, and clear the small-gesture floor.
    if (Math.abs(dy) < Math.abs(dx) * 1.2) return;
    if (Math.abs(dy) < 50) return;
    if (dy < 0 && !snapState.showGallery && descriptionAtBottom()) {
      // Swipe up while in description at bottom → snap to gallery.
      snapToGallery();
    } else if (dy > 0 && snapState.showGallery && galleryAPI.isAtStart()) {
      // Swipe down while in gallery at first image → back to description.
      snapToDescription();
    }
  }, { passive: true });

  document.addEventListener('touchcancel', () => { touchStart = null; }, { passive: true });
}

/* Forward snap: description → gallery. Brings the gallery overlay up
 * from below; the description stays at whatever scroll position the
 * user was at so they come back to where they were. The description
 * text reveal animation runs only on initial entry (see
 * triggerDescriptionReveal), so nothing toggles here on it. */
function snapToGallery(_galleryAPI) {
  if (snapState.showGallery || snapState.isAnimating) return;
  const shell = document.querySelector('[data-project-shell]');
  const gallerySection = document.querySelector('[data-section-gallery]');
  if (!shell || !gallerySection) return;

  snapState.showGallery = true;
  snapState.isAnimating = true;
  shell.classList.add('show-gallery');
  gallerySection.setAttribute('aria-hidden', 'false');

  const reduced = prefersReducedMotion();
  setTimeout(() => {
    snapState.isAnimating = false;
  }, reduced ? 0 : SNAP_DURATION_MS);
}

/* Backward snap: gallery → description. Lowers the gallery overlay
 * and resets it to the first image so the next entry starts fresh
 * (overlay-resets-on-exit convention). The description preserves its
 * scroll position. */
function snapToDescription() {
  if (!snapState.showGallery || snapState.isAnimating) return;
  const shell = document.querySelector('[data-project-shell]');
  const gallerySection = document.querySelector('[data-section-gallery]');
  if (!shell || !gallerySection) return;

  snapState.showGallery = false;
  snapState.isAnimating = true;
  shell.classList.remove('show-gallery');
  gallerySection.setAttribute('aria-hidden', 'true');

  const reduced = prefersReducedMotion();
  // Reset gallery to its first image after the slide-down completes
  // so the user doesn't see the reset, only the clean state on the
  // next entry. teardown is the galleryAPI returned from initGallery.
  setTimeout(() => {
    teardown?.resetToStart?.();
    snapState.isAnimating = false;
  }, reduced ? 0 : SNAP_DURATION_MS);
}
