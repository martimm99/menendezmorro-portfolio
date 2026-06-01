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

import { initGallery } from './gallery.js';
import { initFullscreen, openFullscreen } from './fullscreen.js';
import {
  copyText,
  showToast,
  escapeHtml,
  prefersReducedMotion,
  wrapTextInRevealLines,
  assignRevealLineDelays,
  arrivedViaViewTransition
} from './utils.js';

const SNAP_DURATION_MS = 1000;
const LINE_REVEAL_DELAY_PER_LINE_MS = 80;
const LANDING_REVEAL_DELAY_DIRECT_MS = 60;
const LANDING_REVEAL_DELAY_AFTER_SWEEP_MS = 900;
const GALLERY_STAGGER_MS = 100;
const GALLERY_STAGGER_CAP_INDEX = 3;       // images past this share the cap's delay
const TOP_STAGGER_MS = 0;
const BOTTOM_STAGGER_BASE_MS = 500;
const BOTTOM_STAGGER_STEP_MS = 60;

let teardown = null;
let snapState = { showDescription: false, isAnimating: false };
let touchStart = null;
// Two-step snap-back on desktop: a single scroll-up gesture that just
// reaches the top of the description should park the user there. The
// next *separate* scroll-up gesture is the one that snaps back to
// gallery. This flag is set when scrollTop first hits 0 from a wheel-up
// and is consumed (and cleared) by the next wheel-up that arrives after
// a > GESTURE_GAP_MS gap. Cleared eagerly when the user starts scrolling
// in any other direction, or when leaving the description entirely.
let armedForSnapBack = false;

export function initProject(data, slug) {
  const project = data.projects.find((p) => p.slug === slug);
  if (!project) {
    window.history.replaceState(null, '', '/');
    window.dispatchEvent(new CustomEvent('route-change', { detail: { url: '/' } }));
    return;
  }

  updateHead(data.site, project);
  renderInfoRow(project);
  renderDescription(project);
  setupNavigation(data.site);
  setupSnapTransition();
  initFullscreen();

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
    },
    onForwardAtEnd: snapToDescription,
    // Gate the gallery wheel handler so it only processes events while
    // the gallery section owns the viewport. When the description is
    // showing (or the snap animation is mid-flight), project.js's own
    // window-level wheel listener takes over.
    isActive: () => !snapState.showDescription && !snapState.isAnimating
  });

  teardown = galleryAPI;

  triggerLandingReveal();
}

/* ---------- Landing reveal (BUILD_SPEC §2 sweep-then-content) ----------
 * After the cross-document VT sweep finishes, the page reveals its
 * static chrome and gallery items in a top-to-bottom stagger.
 * Description text is intentionally NOT triggered here — it has its
 * own .reveal-in trigger fired by the snap transition.
 */
function triggerLandingReveal() {
  // Top static elements arrive first, together.
  setRevealDelay('.site-logo > .reveal-up', TOP_STAGGER_MS);
  setRevealDelay('.static-get-in-touch > .reveal-up', TOP_STAGGER_MS);

  // Gallery items sweep DOWN from above their clip, staggered left-to-
  // right. Items past the cap share the cap's delay so a long film-
  // strip doesn't stretch the stagger window forever (extra items
  // would be offscreen at landing anyway).
  document.querySelectorAll('.gallery-item > .reveal-down').forEach((el, index) => {
    const cappedIndex = Math.min(index, GALLERY_STAGGER_CAP_INDEX);
    el.style.setProperty('--reveal-delay', `${(cappedIndex + 1) * GALLERY_STAGGER_MS}ms`);
  });

  // Bottom static elements come up last. Info cells stagger across so
  // LINKS / DURATION / COST arrive in sequence rather than as a block.
  document.querySelectorAll('.static-info-row .info-cell > .reveal-up').forEach((el, i) => {
    el.style.setProperty('--reveal-delay', `${BOTTOM_STAGGER_BASE_MS + i * BOTTOM_STAGGER_STEP_MS}ms`);
  });
  setRevealDelay('.static-back-arrow > .reveal-up', BOTTOM_STAGGER_BASE_MS);

  const startDelay = prefersReducedMotion()
    ? 0
    : (arrivedViaViewTransition()
        ? LANDING_REVEAL_DELAY_AFTER_SWEEP_MS
        : LANDING_REVEAL_DELAY_DIRECT_MS);
  setTimeout(() => {
    document.body.classList.add('reveal-landing-in');
  }, startDelay);
}

function setRevealDelay(selector, delayMs) {
  document.querySelectorAll(selector).forEach((el) => {
    el.style.setProperty('--reveal-delay', `${delayMs}ms`);
  });
}

/* ---------- Head metadata ---------- */

function updateHead(site, project) {
  document.title = `${project.title} — ${site.siteTitle}`;
  setMeta('meta[name="description"]', 'content', project.description || site.siteDescription);
  setMeta('meta[property="og:title"]', 'content', `${project.title} — ${site.siteTitle}`);
  setMeta('meta[property="og:description"]', 'content', project.description || site.siteDescription);
  setMeta('meta[property="og:url"]', 'content', `${site.siteUrl}/${project.slug}`);
  setMeta('link[rel="canonical"]', 'href', `${site.siteUrl}/${project.slug}`);
}

function setMeta(selector, attr, value) {
  const el = document.querySelector(selector);
  if (el) el.setAttribute(attr, value);
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
  // wrapping. Measurement runs while the section is offscreen (no transform
  // dependency — all reveal-lines share the same transform here, so their
  // relative tops still cluster correctly per visual line).
  requestAnimationFrame(() => {
    requestAnimationFrame(() => assignRevealLineDelays(container, LINE_REVEAL_DELAY_PER_LINE_MS));
  });
}

/* ---------- Navigation + chrome wiring ---------- */

function setupNavigation(site) {
  // Logo and back arrow both return to Home with a full reload (Phase 10
  // will replace this with a vertical sweep).
  document.querySelectorAll('[data-nav-home]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      window.location.assign('/');
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

/* ---------- Snap transition (gallery <-> description) ---------- */

function setupSnapTransition() {
  const descriptionSection = document.querySelector('[data-section-description]');
  if (!descriptionSection) return;

  // Two-step snap-back on the wheel: a single continuous scroll-up gesture
  // that takes the user to the top of the description should park them
  // there; only a *separate* scroll-up gesture after that snaps back to
  // gallery. We tell gestures apart by the timestamp gap between
  // consecutive wheel events (same idea as the Home wheel burst detection).
  //
  // The listener is on window, not on the section, so wheel events still
  // arrive when the cursor sits over a static element (header logo, Get
  // in touch, info row, back arrow) — those are siblings of
  // .project-shell and a section-scoped listener wouldn't see them.
  //
  // The wheel-routing piece is handled by pointer-events: none on
  // .section-gallery while .show-description is active (see project.css):
  // without it, Chrome's hover-state cache lingers on the gallery when
  // the description slides over a stationary cursor, which causes the
  // cursor to stay as zoom-in *and* lets wheel events keep targeting
  // gallery items even though they're visually under the description.
  //
  // GESTURE_GAP_MS is 80ms and INERTIA_DELTA_THRESHOLD is 3 — combined,
  // they let a normal touchpad pause between two distinct swipes register
  // as a new gesture without waiting out the full inertia tail. Touchpad
  // inertia events decay exponentially: by filtering events with
  // |deltaY| < 3 (without updating lastWheelAt), the "burst-extending"
  // bookkeeping stops ~200ms after the user lifts instead of dragging on
  // for the full 500ms tail. AT_TOP_THRESHOLD tolerates the sub-pixel
  // scrollTop values macOS browsers sometimes leave after smooth scrolls.
  const GESTURE_GAP_MS = 80;
  const INERTIA_DELTA_THRESHOLD = 3;
  const AT_TOP_THRESHOLD = 1;
  let lastWheelAt = 0;

  window.addEventListener('wheel', (e) => {
    if (!snapState.showDescription) return;
    if (snapState.isAnimating) {
      e.preventDefault();
      return;
    }

    // Skip very small events (inertia tail) — they shouldn't count
    // toward the burst window or reset the arm flag.
    if (Math.abs(e.deltaY) < INERTIA_DELTA_THRESHOLD && Math.abs(e.deltaX) < INERTIA_DELTA_THRESHOLD) {
      e.preventDefault();
      return;
    }

    // Not at the top — native scroll handles the wheel when the cursor is
    // over the description; we just track the burst so the next gesture's
    // first event isn't mistaken for a continuation of this one.
    if (descriptionSection.scrollTop >= AT_TOP_THRESHOLD) {
      armedForSnapBack = false;
      lastWheelAt = e.timeStamp;
      return;
    }

    // At the top, but scrolling sideways or downward — not a snap-back
    // attempt. Disarm.
    if (e.deltaY >= 0) {
      armedForSnapBack = false;
      lastWheelAt = e.timeStamp;
      return;
    }

    // At the top, wheel-up.
    const isNewBurst = (e.timeStamp - lastWheelAt) > GESTURE_GAP_MS;
    lastWheelAt = e.timeStamp;

    if (armedForSnapBack && isNewBurst) {
      // Second, separate scroll-up gesture at the top → snap back.
      e.preventDefault();
      armedForSnapBack = false;
      snapToGallery();
      return;
    }

    // Either we just arrived at the top in this gesture, or we're still
    // inside the same gesture (continued wheel events / inertia). Arm and
    // wait for the next gesture.
    armedForSnapBack = true;
    e.preventDefault();
  }, { passive: false });

  // Mobile vertical swipe — listen on document so a swipe that starts
  // over a static element (info row, back arrow, header logo) still
  // triggers the snap. Those static elements are siblings of .project-
  // shell in the DOM, so a shell-scoped listener would miss them.
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
    if (dy < 0 && !snapState.showDescription) {
      snapToDescription();
    } else if (dy > 0 && snapState.showDescription && descriptionSection.scrollTop < 1) {
      snapToGallery();
    }
  }, { passive: true });

  document.addEventListener('touchcancel', () => { touchStart = null; }, { passive: true });
}

function snapToDescription() {
  if (snapState.showDescription || snapState.isAnimating) return;
  const shell = document.querySelector('[data-project-shell]');
  const descriptionSection = document.querySelector('[data-section-description]');
  const descriptionContent = document.querySelector('[data-description-content]');
  if (!shell || !descriptionSection) return;

  armedForSnapBack = false;
  snapState.showDescription = true;
  snapState.isAnimating = true;
  shell.classList.add('show-description');
  descriptionSection.setAttribute('aria-hidden', 'false');

  const reduced = prefersReducedMotion();
  const animDelay = reduced ? 0 : Math.round(SNAP_DURATION_MS * 0.6);
  setTimeout(() => {
    descriptionContent?.classList.add('reveal-in');
  }, animDelay);

  setTimeout(() => {
    snapState.isAnimating = false;
  }, reduced ? 0 : SNAP_DURATION_MS);
}

function snapToGallery() {
  if (!snapState.showDescription || snapState.isAnimating) return;
  const shell = document.querySelector('[data-project-shell]');
  const descriptionSection = document.querySelector('[data-section-description]');
  const descriptionContent = document.querySelector('[data-description-content]');
  if (!shell || !descriptionSection) return;

  armedForSnapBack = false;
  snapState.showDescription = false;
  snapState.isAnimating = true;
  shell.classList.remove('show-description');
  descriptionSection.setAttribute('aria-hidden', 'true');
  if (descriptionSection.scrollTop) descriptionSection.scrollTop = 0;

  const reduced = prefersReducedMotion();
  setTimeout(() => {
    descriptionContent?.classList.remove('reveal-in');
    snapState.isAnimating = false;
  }, reduced ? 0 : SNAP_DURATION_MS);
}
