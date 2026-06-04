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
 *   - Back arrow and the page logo both return to / via the cross-
 *     document View Transitions API (vertical sweep in base.css).
 *   - Info row shows RESULTS / LINKS / DURATION. The LINKS cell hides
 *     when project.links is empty (per spec §6.1). RESULTS shows the
 *     word "Gallery" as a click-to-snap-to-gallery link.
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
  forceRevealAndNavigate,
  setupScrollReveal
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
      // NE diagonal arrow markup — slides in on hover (see base.css
      // hover styles for .info-link). External-link semantic: each
      // link opens in a new tab. The arrow path lives in the shared
      // sprite at /assets/icons/arrows.svg so it isn't duplicated
      // across every call site.
      const arrowSvg = '<span class="info-arrow-clip" aria-hidden="true"><svg class="info-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" focusable="false"><use href="/assets/icons/arrows.svg#arrow-ne"/></svg></span>';
      linksSlot.innerHTML = project.links
        .map((l) => `<a href="${encodeURI(l.url)}" target="_blank" rel="noopener" class="info-link">${arrowSvg}${escapeHtml(l.text)}</a>`)
        .join(', ');
    } else {
      linksCell.hidden = true;
    }
  }
  const durationSlot = document.querySelector('[data-info-duration]');
  if (durationSlot) durationSlot.textContent = project.duration || '';

  // RESULTS cell: hide if the project has no gallery media (the
  // "Gallery" link would have nothing to navigate to). Otherwise show
  // it and wire the click to the same snap action used by scroll-
  // down at the description bottom. snapToGallery is a no-op when
  // already in the gallery section, so the button being a no-op
  // there is handled automatically.
  const resultsCell = document.querySelector('[data-info-cell="results"]');
  if (resultsCell) {
    const hasGallery = Array.isArray(project.media) && project.media.length > 0;
    resultsCell.hidden = !hasGallery;
    if (hasGallery) {
      const snapBtn = resultsCell.querySelector('[data-action-snap-gallery]');
      snapBtn?.addEventListener('click', () => snapToGallery());
    }
  }
}

/* ---------- Description content ---------- */

function renderDescription(project) {
  const container = document.querySelector('[data-description-content]');
  if (!container) return;

  // Spec Appendix C: long descriptions are CMS-authored and currently
  // empty in projects.json. Until the CMS lands, fall back to a
  // multi-paragraph placeholder long enough to require scrolling so
  // the snap-to-gallery edge can be exercised in QA. CMS-authored
  // content (when project.longDescription is non-empty) replaces
  // this fallback entirely.
  const text = project.longDescription || placeholderLongDescription(project);

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

// Multi-paragraph placeholder. Long enough to overflow the
// description section on every reasonable viewport so the scroll
// + snap-to-gallery edge can be tested. Replaced wholesale when
// project.longDescription is non-empty (via the CMS).
function placeholderLongDescription(project) {
  return [
    project.description,
    `${project.title} — placeholder long-form description. Real content will replace this once it's authored through the Decap CMS, at which point this fallback function is no longer hit.`,
    'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.',
    'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.',
    'Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo.',
    'Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt. Neque porro quisquam est, qui dolorem ipsum quia dolor sit amet.',
    'At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis praesentium voluptatum deleniti atque corrupti quos dolores et quas molestias excepturi sint occaecati cupiditate non provident.'
  ].filter(Boolean).join('\n\n');
}

/* The description is the landing section (v1.8 reversed the section
 * order). Two-phase reveal:
 *   1. Clips on-screen at trigger time fire as a cascade waterfall —
 *      each visual line stages LINE_REVEAL_DELAY_PER_LINE_MS after the
 *      one above it via the --reveal-delay variable assigned by
 *      assignRevealLineDelays.
 *   2. Clips below the fold are observed individually. When a clip's
 *      top edge crosses the viewport bottom, its line-reveal fires
 *      immediately (cascade delay reset to 0ms). Words on the same
 *      visual line share a y-position, so they fire together and the
 *      line animates as one unit as the user scrolls into it.
 *
 * Initial trigger is delayed until the cross-document VT sweep (if
 * any) finishes, so the on-screen lines don't start animating before
 * the page is in place. */
function triggerDescriptionReveal() {
  const container = document.querySelector('[data-description-content]');
  if (!container) return;
  const clips = Array.from(container.querySelectorAll('.reveal-line-clip'));
  if (clips.length === 0) return;
  if (prefersReducedMotion()) {
    clips.forEach((c) => c.classList.add('reveal-in'));
    return;
  }
  const delay = arrivedViaViewTransition()
    ? DESCRIPTION_REVEAL_DELAY_AFTER_SWEEP_MS
    : DESCRIPTION_REVEAL_DELAY_DIRECT_MS;
  setTimeout(() => {
    const vh = window.innerHeight;
    const inView = [];
    const offView = [];
    for (const clip of clips) {
      const rect = clip.getBoundingClientRect();
      if (rect.bottom > 0 && rect.top < vh) inView.push(clip);
      else offView.push(clip);
    }
    for (const c of inView) c.classList.add('reveal-in');
    setupScrollReveal(offView);
  }, delay);
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
 * Section order (v1.9 reversed):
 *   description (landing) ──forward (down)──▶ gallery (overlay)
 *                       ◀───backward (up)──
 *
 * Gallery wheel handling (v1.11): touchpad swipes drive the
 * gallery in real time (free scroll, clamped at both edges) and
 * stay wherever the user releases — no snap to the nearest image
 * once the swipe ends. Mouse-wheel clicks still snap exactly one
 * image per click. The two are distinguished by buffering the
 * first event of a gesture for ~30ms — a follow-up event arriving
 * inside that window means it's a touchpad burst; nothing arriving
 * means it was a one-shot mouse click.
 *
 * Description-snap-back from the gallery only fires on the FIRST
 * event of a NEW gesture at the first image with a backward delta.
 * A long swipe sweeping the gallery from the last image to the
 * first hits the start edge and stops there — the same gesture
 * cannot continue into the description snap. The user has to
 * release, then start a new swipe.
 *
 * One window-level listener owns both modes (gallery + description).
 * A gestureActed flag prevents a second cross-section snap inside
 * the same gesture; it resets after GESTURE_END_GAP_MS of wheel
 * silence. snapState.isAnimating blocks everything during the
 * actual section-snap animation.
 *
 * passive: true: gallery scrolls via CSS transform (no native
 * scroll container to preventDefault on); the description's
 * edge bounce is contained by overscroll-behavior-y: contain in
 * project.css. AT_EDGE_THRESHOLD tolerates sub-pixel scrollTop
 * values macOS browsers sometimes leave after smooth scrolls.
 */
function setupWheelAndSnap(galleryAPI) {
  const descriptionSection = document.querySelector('[data-section-description]');
  if (!descriptionSection) return;

  const GESTURE_END_GAP_MS = 80;
  const MOUSE_BUFFER_MS = 30;
  const AT_EDGE_THRESHOLD = 1;
  // Touchpad inertia tail filter — events below this delta magnitude
  // don't refresh the gesture window. Without it a strong fling's
  // long-lasting weak inertia kept the window open indefinitely and
  // a second snap stayed blocked (matching the home.js fix).
  const INERTIA_DELTA_THRESHOLD = 4;

  let lastEventAt = 0;
  let gestureActed = false;

  // Gallery-specific gesture state. mode flips to 'continuous' as
  // soon as a second wheel event arrives inside the buffer window
  // for the current gesture; resets on gesture end.
  let mode = null;                  // null = unknown / first event; 'continuous' = touchpad
  let bufferedEvent = null;
  let bufferTimer = null;

  function descriptionAtBottom() {
    return descriptionSection.scrollTop + descriptionSection.clientHeight
      >= descriptionSection.scrollHeight - AT_EDGE_THRESHOLD;
  }

  function galleryGestureReset() {
    mode = null;
    bufferedEvent = null;
    if (bufferTimer) { clearTimeout(bufferTimer); bufferTimer = null; }
  }

  window.addEventListener('wheel', (e) => {
    const delta = pickAxis(e.deltaX, e.deltaY);

    // Only "real input" events (above the inertia threshold) refresh
    // the gesture window. Weak inertia tail events still get passed
    // through to the handlers below (so free-scroll feels smooth as
    // the burst decays) but don't extend the gestureActed gate.
    if (Math.abs(delta) >= INERTIA_DELTA_THRESHOLD) {
      const gap = e.timeStamp - lastEventAt;
      if (gap > GESTURE_END_GAP_MS) {
        gestureActed = false;
        galleryGestureReset();
      }
      lastEventAt = e.timeStamp;
    }

    if (snapState.isAnimating) return;
    if (gestureActed) return;

    if (snapState.showGallery) {
      handleGalleryWheel(e);
    } else {
      handleDescriptionWheel(e);
    }
  }, { passive: true });

  function handleDescriptionWheel(e) {
    // Native scroll handles wheel events anywhere inside the
    // description that isn't at the very bottom. A forward wheel
    // landing while already at the bottom snaps up to the gallery.
    if (!descriptionAtBottom()) return;
    if (e.deltaY <= 0) return;
    snapToGallery();
    gestureActed = true;
  }

  function handleGalleryWheel(e) {
    const delta = pickAxis(e.deltaX, e.deltaY);
    if (delta === 0) return;

    // Description-snap-back: only on a NEW gesture (mode null AND
    // no buffer pending) at the first image with a backward delta.
    // A long swipe that *passes through* the first image mid-burst
    // is already in 'continuous' mode and skips this branch — it
    // just clamps at scroll position 0.
    if (mode === null && !bufferedEvent && galleryAPI.isAtStart() && delta < 0) {
      snapToDescription();
      gestureActed = true;
      galleryGestureReset();
      return;
    }

    if (mode === 'continuous') {
      // Touchpad burst — free-scroll the gallery in real time. The
      // gallery stays wherever the user releases; no snap-to-nearest
      // when the burst ends.
      galleryAPI.freeScrollDelta(delta);
      return;
    }

    if (bufferedEvent) {
      // Second wheel event inside the buffer window — it's a
      // touchpad burst. Apply both events as free-scroll and
      // switch to continuous mode for the rest of the gesture.
      clearTimeout(bufferTimer);
      bufferTimer = null;
      mode = 'continuous';
      const buffDelta = pickAxis(bufferedEvent.deltaX, bufferedEvent.deltaY);
      bufferedEvent = null;
      galleryAPI.freeScrollDelta(buffDelta);
      galleryAPI.freeScrollDelta(delta);
      return;
    }

    // First event of a new gesture. Buffer it and wait for a
    // follow-up; if none arrives within MOUSE_BUFFER_MS, it was
    // a single mouse-wheel click — discrete one-image step.
    bufferedEvent = e;
    bufferTimer = setTimeout(() => {
      const buffDelta = pickAxis(bufferedEvent.deltaX, bufferedEvent.deltaY);
      bufferedEvent = null;
      bufferTimer = null;
      galleryAPI.step(buffDelta);
    }, MOUSE_BUFFER_MS);
  }

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
    if (Math.abs(dy) < Math.abs(dx) * 1.2) return;
    if (Math.abs(dy) < 50) return;
    if (dy < 0 && !snapState.showGallery && descriptionAtBottom()) {
      snapToGallery();
    } else if (dy > 0 && snapState.showGallery && galleryAPI.isAtStart()) {
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
