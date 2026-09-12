/**
 * fullscreen.js — Image fullscreen state for the Project page.
 *
 * Per BUILD_SPEC.md v1.5 §5.4: clicking a gallery item expands the
 * media (via a FLIP-style transition on top/left/width/height) from
 * its in-gallery rect to a centered ~90vw position. Pressing Esc,
 * clicking anywhere outside the media, or clicking the (repurposed)
 * static back arrow closes by reversing the same transition back to
 * the gallery rect. No image-to-image navigation while open — to view
 * a different item close and click another.
 *
 * The module owns no UI on its own — it operates on the .fullscreen-
 * stage scaffold already present in project.html, plus the page's
 * existing .static-back-arrow (see morphBackArrowIcon below).
 *
 * Figma prototype items (`type: "figma"`) expand their poster still like
 * an image; once the expand settles, a live Figma embed <iframe> is
 * mounted over the poster and faded in. Closing removes the iframe (so
 * the Figma viewer stops) and collapses the poster back to the gallery.
 * The back arrow's click-to-close (below) is the reliable way to close
 * a Figma item — Esc can be swallowed by the embedded prototype once
 * it has focus.
 */

import { prefersReducedMotion } from './utils.js';

const ANIMATION_MS = 420;
// Identifies this site to Figma's embed endpoint (embed-host / embed_host).
const FIGMA_EMBED_HOST = 'menendezmorro';
const SIDE_MARGIN_VW_DESKTOP = 5;
const SIDE_MARGIN_VW_MOBILE = 2;  // matches gallery's 96vw items so wide
                                  // images don't visually shrink on open
const MOBILE_BREAKPOINT_PX = 768;
const TOP_BOTTOM_MARGIN_PX = 80; // leaves room for the X button + caption

// Back-arrow icon morph (X ↔ "compress" arrows) — see morphBackArrowIcon.
const ICON_MORPH_MS = 620;
const ICON_TOP_X        = [[6, 6], [12, 12], [18, 6]];
const ICON_TOP_CLOSE     = [[4, 4], [10, 10], [10, 6]];
const ICON_BOTTOM_X     = [[6, 18], [12, 12], [18, 18]];
const ICON_BOTTOM_CLOSE  = [[14, 18], [14, 14], [20, 20]];

const state = {
  isOpen: false,
  isAnimating: false,
  sourceItem: null,
  sourceRect: null
};

let stage, backdrop, mediaWrap, captionEl;
let escListener = null;
let trapListener = null;
let openerElement = null;
let embedRevealTimer = null;

export function initFullscreen() {
  stage     = document.querySelector('[data-fullscreen-stage]');
  backdrop  = document.querySelector('[data-fullscreen-backdrop]');
  mediaWrap = document.querySelector('[data-fullscreen-media]');
  captionEl = document.querySelector('[data-fullscreen-caption]');
  if (!stage || !mediaWrap) return;

  // Clicking the backdrop (empty space around the media) closes fullscreen.
  // The backdrop is behind the media wrap in z-order, so clicks on the media
  // — including native video controls — go to the media, not the backdrop.
  backdrop?.addEventListener('click', () => { if (state.isOpen) closeFullscreen(); });

  // The static back arrow stays visible and on top while fullscreen is open
  // (see fullscreen.css) and closes fullscreen instead of navigating home.
  // Capture phase on document, ahead of project.js's own bubble-phase
  // "go home" listener on the same element, so it wins regardless of
  // listener registration order.
  document.addEventListener('click', (e) => {
    if (!state.isOpen) return;
    if (!e.target.closest('.static-back-arrow')) return;
    e.preventDefault();
    e.stopPropagation();
    closeFullscreen();
  }, true);
}

export function openFullscreen(galleryItem) {
  if (!stage || state.isOpen || state.isAnimating) return;
  const sourceMedia = galleryItem.querySelector('img, video');
  if (!sourceMedia) return;

  const sourceRect = galleryItem.getBoundingClientRect();
  state.sourceItem = galleryItem;
  state.sourceRect = { top: sourceRect.top, left: sourceRect.left, width: sourceRect.width, height: sourceRect.height };
  state.isAnimating = true;

  // Morph the back-arrow icon in parallel with the expand, so it reads
  // "this now closes the media" from the first frame.
  morphBackArrowIcon(/* toClose */ true);

  // Clone the media and place it inside the stage at the source rect.
  const clone = sourceMedia.cloneNode(true);
  configureVideoClone(clone);
  mediaWrap.innerHTML = '';
  mediaWrap.appendChild(clone);

  // Caption text from the same gallery item.
  const sourceCaption = galleryItem.querySelector('.gallery-caption');
  const captionText = sourceCaption?.textContent?.trim() ?? '';
  captionEl.textContent = captionText;
  captionEl.hidden = captionText.length === 0;

  // Snap the wrap to the source rect with no transition so the first
  // visible state matches the gallery exactly.
  mediaWrap.style.transition = 'none';
  applyRect(mediaWrap, state.sourceRect);

  // Hide the original gallery item so the user doesn't see a twin.
  galleryItem.classList.add('is-source-fullscreen');

  // Reveal the stage and switch the body into the fullscreen-active
  // mode so the rest of the chrome hides.
  stage.hidden = false;
  document.body.classList.add('fullscreen-active');
  // Force a reflow so the source rect is committed before transitioning.
  // eslint-disable-next-line no-unused-expressions
  mediaWrap.offsetWidth;

  // Compute the target rect from the source element (guaranteed loaded)
  // rather than the clone (which may not have decoded naturalWidth yet).
  const targetRect = computeTargetRect(galleryItem);
  positionCaption(captionEl, targetRect);

  mediaWrap.style.transition = '';
  applyRect(mediaWrap, targetRect);
  stage.classList.add('is-open');

  openerElement = document.activeElement;

  setTimeout(() => {
    state.isOpen = true;
    state.isAnimating = false;
    tryPlayVideo(clone);
    mountEmbed(galleryItem);
    // Move focus into the stage so screen readers and keyboard users land
    // inside the modal, not behind it.
    stage.focus();
  }, prefersReducedMotion() ? 0 : ANIMATION_MS + 20);

  // Esc to close.
  escListener = (e) => {
    if (e.key === 'Escape') closeFullscreen();
  };
  document.addEventListener('keydown', escListener);

  // Focus trap — keep Tab cycling within the stage.
  trapListener = (e) => {
    if (e.key !== 'Tab' || !state.isOpen) return;
    const focusable = Array.from(stage.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )).filter((el) => !el.disabled);
    if (focusable.length === 0) { e.preventDefault(); return; }
    const first = focusable[0];
    const last  = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last)  { e.preventDefault(); first.focus(); }
    }
  };
  document.addEventListener('keydown', trapListener);
}

function closeFullscreen() {
  if (!stage || !state.isOpen || state.isAnimating) return;
  state.isAnimating = true;

  // Morph the back-arrow icon back to the X in parallel with the collapse.
  morphBackArrowIcon(/* toClose */ false);

  // Fade out the caption immediately by removing is-open; meanwhile
  // animate the media back to the source rect.
  stage.classList.remove('is-open');

  // Pause any video so it doesn't keep playing after collapse.
  const video = mediaWrap.querySelector('video');
  if (video) video.pause();

  // Tear down a Figma embed immediately so its viewer stops running. The
  // poster clone stays in the wrap and handles the collapse animation.
  const embed = mediaWrap.querySelector('iframe');
  if (embed) embed.remove();
  clearTimeout(embedRevealTimer);

  // Recompute the source rect in case the layout moved while open
  // (e.g., window resize) — fall back to the stored rect.
  const galleryItem = state.sourceItem;
  let rect = state.sourceRect;
  if (galleryItem && galleryItem.isConnected) {
    // The source item is visibility: hidden but still in layout, so
    // getBoundingClientRect is valid.
    const live = galleryItem.getBoundingClientRect();
    rect = { top: live.top, left: live.left, width: live.width, height: live.height };
  }
  applyRect(mediaWrap, rect);

  setTimeout(() => {
    stage.hidden = true;
    mediaWrap.innerHTML = '';
    document.body.classList.remove('fullscreen-active');
    if (galleryItem) galleryItem.classList.remove('is-source-fullscreen');
    state.isOpen = false;
    state.isAnimating = false;
    state.sourceItem = null;
    state.sourceRect = null;
    if (escListener) {
      document.removeEventListener('keydown', escListener);
      escListener = null;
    }
    if (trapListener) {
      document.removeEventListener('keydown', trapListener);
      trapListener = null;
    }
    // Return focus to the element that triggered the modal.
    openerElement?.focus();
    openerElement = null;
  }, prefersReducedMotion() ? 0 : ANIMATION_MS + 20);
}

/* ---------- Back-arrow icon morph ---------- */

// The static back arrow (top-right, present on every project-page state)
// doubles as the fullscreen close control while a media item is expanded.
// Its icon morphs between the plain X and two small diagonal arrows
// pointing at each other, so the change in meaning is visible, not just
// implied. True point-by-point morph, not a cross-fade: the X's two
// "^"/"V" chevrons — each a 3-point polyline sharing the center point —
// rotate independently, the leg already aimed roughly at its target
// direction grows into an arrow shaft, and the other leg swings in to
// become the arrowhead's barb. Nothing is added or removed, so it's the
// same technique family as the preloader's rAF-driven path animation,
// just applied to <polyline> points instead of a path `d` string.
// Choreography confirmed with Martí via an interactive preview before
// implementation (2026-09-11).
function easeInOutQuint(t) {
  return t < 0.5 ? 16 * t ** 5 : 1 - (-2 * t + 2) ** 5 / 2;
}

function lerpPoints(from, to, t) {
  return from.map((p, i) => {
    const q = to[i];
    return `${p[0] + (q[0] - p[0]) * t},${p[1] + (q[1] - p[1]) * t}`;
  }).join(' ');
}

function morphBackArrowIcon(toClose) {
  const backArrow = document.querySelector('.static-back-arrow');
  const topSeg = backArrow?.querySelector('[data-arrow-seg="top"]');
  const bottomSeg = backArrow?.querySelector('[data-arrow-seg="bottom"]');
  if (!backArrow || !topSeg || !bottomSeg) return;

  backArrow.setAttribute('aria-label', toClose ? 'Close full-screen view' : 'Back to home');

  const topFrom = toClose ? ICON_TOP_X : ICON_TOP_CLOSE;
  const topTo = toClose ? ICON_TOP_CLOSE : ICON_TOP_X;
  const bottomFrom = toClose ? ICON_BOTTOM_X : ICON_BOTTOM_CLOSE;
  const bottomTo = toClose ? ICON_BOTTOM_CLOSE : ICON_BOTTOM_X;

  if (prefersReducedMotion()) {
    topSeg.setAttribute('points', lerpPoints(topFrom, topTo, 1));
    bottomSeg.setAttribute('points', lerpPoints(bottomFrom, bottomTo, 1));
    return;
  }

  let start = null;
  function tick(now) {
    if (start === null) start = now;
    const eased = easeInOutQuint(Math.min((now - start) / ICON_MORPH_MS, 1));
    topSeg.setAttribute('points', lerpPoints(topFrom, topTo, eased));
    bottomSeg.setAttribute('points', lerpPoints(bottomFrom, bottomTo, eased));
    if (now - start < ICON_MORPH_MS) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

/* ---------- Helpers ---------- */

function applyRect(el, rect) {
  el.style.top    = `${rect.top}px`;
  el.style.left   = `${rect.left}px`;
  el.style.width  = `${rect.width}px`;
  el.style.height = `${rect.height}px`;
}

function computeTargetRect(galleryItem) {
  // Read aspect ratio from the source gallery item — images/videos are
  // already decoded there, so naturalWidth/videoWidth are always valid.
  // Reading from the clone can return 0 if the browser hasn't re-decoded it.
  // A Figma item may carry an explicit `aspect` override (its poster shape
  // is otherwise used, same as any image).
  let aspect = 16 / 9; // safe default
  const aspectOverride = parseAspect(galleryItem.dataset.embedAspect);
  if (aspectOverride) {
    aspect = aspectOverride;
  } else {
    const srcImg = galleryItem.querySelector('img');
    if (srcImg?.naturalWidth && srcImg.naturalHeight) {
      aspect = srcImg.naturalWidth / srcImg.naturalHeight;
    } else {
      const srcVideo = galleryItem.querySelector('video');
      if (srcVideo?.videoWidth && srcVideo.videoHeight) {
        aspect = srcVideo.videoWidth / srcVideo.videoHeight;
      }
    }
  }

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // Mobile uses tighter side margins so wide images don't shrink
  // relative to their gallery-view size (gallery items are 96vw on
  // mobile; matching that here keeps the expand visually "into" the
  // image, never out of it).
  const sideMarginVw = vw <= MOBILE_BREAKPOINT_PX
    ? SIDE_MARGIN_VW_MOBILE
    : SIDE_MARGIN_VW_DESKTOP;
  const availableWidth  = vw * (1 - 2 * sideMarginVw / 100);
  const availableHeight = vh - 2 * TOP_BOTTOM_MARGIN_PX;

  let width  = availableWidth;
  let height = width / aspect;
  if (height > availableHeight) {
    height = availableHeight;
    width  = height * aspect;
  }
  return {
    top:  (vh - height) / 2,
    left: (vw - width)  / 2,
    width,
    height
  };
}

function positionCaption(el, rect) {
  // Sit the caption directly below the image, left-aligned to it.
  el.style.top    = `${rect.top + rect.height + 8}px`;
  el.style.left   = `${rect.left}px`;
  el.style.width  = `${rect.width}px`;
  el.style.height = 'auto';
}

function configureVideoClone(clone) {
  if (clone.tagName !== 'VIDEO') return;
  clone.muted = false;
  clone.controls = true;
  clone.loop = false;
  clone.autoplay = false; // we trigger play() manually after the expand settles
  // Clear any inline mute attribute that may have been cloned from gallery.
  clone.removeAttribute('muted');
}

function tryPlayVideo(clone) {
  if (clone.tagName !== 'VIDEO') return;
  const p = clone.play();
  if (p && typeof p.catch === 'function') {
    p.catch(() => {
      // Browser blocked autoplay with sound — fall back to muted autoplay.
      clone.muted = true;
      clone.play().catch(() => { /* still blocked; user can hit play */ });
    });
  }
}

/* ---------- Figma prototype embed ---------- */

// Build the live Figma <iframe> over the already-expanded poster clone
// and fade it in once it loads. No-op for non-embed items.
function mountEmbed(galleryItem) {
  const embedUrl = galleryItem?.dataset.embedUrl;
  if (!embedUrl) return;
  const src = figmaEmbedSrc(embedUrl);
  if (!src) return;

  const iframe = document.createElement('iframe');
  iframe.src = src;
  iframe.title = galleryItem.querySelector('img')?.alt || 'Figma prototype';
  iframe.className = 'fullscreen-embed';
  iframe.loading = 'lazy';
  iframe.allowFullscreen = true;
  iframe.setAttribute('allow', 'fullscreen');
  iframe.referrerPolicy = 'no-referrer';

  const reveal = () => iframe.classList.add('is-ready');
  iframe.addEventListener('load', reveal, { once: true });
  // Cross-origin load can be slow or (rarely) not fire — reveal anyway.
  // Stashed so closeFullscreen can cancel it on an early close (opening
  // and closing within 2.5s is a completely normal interaction) — left
  // running, it would fire after the iframe is already removed.
  embedRevealTimer = setTimeout(reveal, 2500);

  mediaWrap.appendChild(iframe);
}

// Normalise whatever the CMS stored — a share link, an embed.figma.com
// URL, or a full <iframe …> snippet — into an embeddable iframe src.
// Returns '' if it can't be recognised as a Figma URL.
function figmaEmbedSrc(raw) {
  let value = String(raw || '').trim();

  const fromSnippet = value.match(/<iframe[^>]*\ssrc=["']([^"']+)["']/i);
  if (fromSnippet) value = fromSnippet[1].replace(/&amp;/g, '&');

  let url;
  try {
    url = new URL(value);
  } catch {
    return '';
  }
  const host = url.hostname.toLowerCase();
  if (!host.endsWith('figma.com')) return '';

  // Already an embed URL — just make sure it identifies a host.
  if (host === 'embed.figma.com') {
    if (!url.searchParams.has('embed-host')) url.searchParams.set('embed-host', FIGMA_EMBED_HOST);
    return url.toString();
  }

  // Old-style wrapper endpoint (www.figma.com/embed?embed_host=…&url=…) — valid as-is.
  if (url.pathname === '/embed') return url.toString();

  // A normal share link (/proto/, /design/, /file/, /board/, /slides/, /deck/)
  // → same path on embed.figma.com with an embed-host param.
  if (/^\/(proto|design|file|board|slides|deck)\//.test(url.pathname)) {
    const embed = new URL('https://embed.figma.com' + url.pathname + url.search);
    embed.searchParams.set('embed-host', FIGMA_EMBED_HOST);
    return embed.toString();
  }

  // Any other figma.com URL — fall back to the wrapper endpoint.
  return `https://www.figma.com/embed?embed_host=${FIGMA_EMBED_HOST}&url=${encodeURIComponent(value)}`;
}

// Parse "16:9", "9/16", or a bare decimal like "1.6" into a width/height
// ratio. Returns null for blank or malformed input.
function parseAspect(value) {
  if (!value) return null;
  const parts = String(value).trim().split(/[:/]/);
  if (parts.length === 2) {
    const w = Number(parts[0]);
    const h = Number(parts[1]);
    return w > 0 && h > 0 ? w / h : null;
  }
  const n = Number(parts[0]);
  return n > 0 ? n : null;
}
