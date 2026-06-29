/**
 * fullscreen.js — Image fullscreen state for the Project page.
 *
 * Per BUILD_SPEC.md v1.5 §5.4: clicking a gallery item expands the
 * media (via a FLIP-style transition on top/left/width/height) from
 * its in-gallery rect to a centered ~90vw position. Pressing Esc or
 * clicking anywhere outside the media closes by reversing the same
 * transition back to the gallery rect. No image-to-image navigation
 * while open — to view a different item close and click another.
 *
 * The module owns no UI on its own — it operates on the .fullscreen-
 * stage scaffold already present in project.html.
 */

import { prefersReducedMotion } from './utils.js';

const ANIMATION_MS = 420;
const SIDE_MARGIN_VW_DESKTOP = 5;
const SIDE_MARGIN_VW_MOBILE = 2;  // matches gallery's 96vw items so wide
                                  // images don't visually shrink on open
const MOBILE_BREAKPOINT_PX = 768;
const TOP_BOTTOM_MARGIN_PX = 80; // leaves room for the X button + caption

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
}

export function openFullscreen(galleryItem) {
  if (!stage || state.isOpen || state.isAnimating) return;
  const sourceMedia = galleryItem.querySelector('img, video');
  if (!sourceMedia) return;

  const sourceRect = galleryItem.getBoundingClientRect();
  state.sourceItem = galleryItem;
  state.sourceRect = { top: sourceRect.top, left: sourceRect.left, width: sourceRect.width, height: sourceRect.height };
  state.isAnimating = true;

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

  // Fade out the caption / X immediately by removing is-open; meanwhile
  // animate the media back to the source rect.
  stage.classList.remove('is-open');

  // Pause any video so it doesn't keep playing after collapse.
  const video = mediaWrap.querySelector('video');
  if (video) video.pause();

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
  let aspect = 16 / 9; // safe default
  const srcImg = galleryItem.querySelector('img');
  if (srcImg?.naturalWidth && srcImg.naturalHeight) {
    aspect = srcImg.naturalWidth / srcImg.naturalHeight;
  } else {
    const srcVideo = galleryItem.querySelector('video');
    if (srcVideo?.videoWidth && srcVideo.videoHeight) {
      aspect = srcVideo.videoWidth / srcVideo.videoHeight;
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
