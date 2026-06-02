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
  forceRevealAndNavigate
} from './utils.js';

const SNAP_DURATION_MS = 1000;
const LINE_REVEAL_DELAY_PER_LINE_MS = 80;

let teardown = null;
let snapState = { showDescription: false, isAnimating: false };
let touchStart = null;

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
 * One window-level wheel listener owns the gallery's per-image
 * stepping and the gallery <-> description snap. Throttling is a
 * straight "no actions for STEP_COOLDOWN_MS after the last action"
 * rule on the listener side. Earlier attempts used burst-gap
 * detection (the home.js pattern) but that updated lastWheelAt on
 * every event, so touchpad inertia kept extending the burst
 * window — a user's next swipe arriving inside the inertia tail
 * was treated as continuation and dropped, and only a cursor
 * nudge (which cancels Chrome's inertia delivery) brought the
 * listener back. An action-cooldown is anchored to "time since
 * we last did something" instead, so inertia events simply land
 * during the cooldown window and are ignored without extending
 * it.
 *
 * For the gallery <-> description snap, snapState.isAnimating
 * already blocks the listener for the full snap duration (1s),
 * so the cooldown only needs to cover the gallery's per-image
 * scroll (SCROLL_TRANSITION_MS = 350ms in gallery.js) plus a
 * small buffer to outlast typical touchpad inertia.
 *
 * passive: true: gallery scrolls via CSS transform (no native
 * scroll container to preventDefault on), and the description's
 * edge bounce is contained by overscroll-behavior-y: contain in
 * project.css. AT_TOP_THRESHOLD tolerates sub-pixel scrollTop
 * values macOS browsers sometimes leave after smooth scrolls.
 */
function setupWheelAndSnap(galleryAPI) {
  const descriptionSection = document.querySelector('[data-section-description]');
  if (!descriptionSection) return;

  const STEP_COOLDOWN_MS = 400;
  const AT_TOP_THRESHOLD = 1;
  let lastActionAt = 0;

  window.addEventListener('wheel', (e) => {
    if (snapState.isAnimating) return;
    if (e.timeStamp - lastActionAt < STEP_COOLDOWN_MS) return;

    const delta = pickAxis(e.deltaX, e.deltaY);
    if (delta === 0) return;

    if (snapState.showDescription) {
      // Native scroll handles wheel events anywhere inside the
      // description that isn't at the very top. A wheel-up landing
      // while already at the top snaps back to gallery.
      if (descriptionSection.scrollTop >= AT_TOP_THRESHOLD) return;
      if (e.deltaY >= 0) return;
      snapToGallery();
      // snapState.isAnimating gates everything for SNAP_DURATION_MS
      // so we don't need to update lastActionAt here.
    } else {
      const result = galleryAPI.step(delta);
      if (result === 'stepped') {
        lastActionAt = e.timeStamp;
      } else if (result === 'at-end' && delta > 0) {
        snapToDescription();
        // snapState.isAnimating gates the next events; no lastActionAt
        // update needed.
      }
    }
  }, { passive: true });

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
