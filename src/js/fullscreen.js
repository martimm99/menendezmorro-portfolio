/**
 * fullscreen.js — Image fullscreen state for the Project page.
 *
 * Per BUILD_SPEC.md v1.5 §5.4: clicking a gallery item expands the
 * media (via a FLIP-style transition on top/left/width/height) from
 * its in-gallery rect to a centered ~90vw position. The X button or
 * Esc closes by reversing the same transition back to the gallery
 * rect. No image-to-image navigation while open — to view a different
 * media item the user closes the current state and clicks another.
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

let stage, mediaWrap, captionEl, closeBtn;
let escListener = null;

export function initFullscreen() {
  stage      = document.querySelector('[data-fullscreen-stage]');
  mediaWrap  = document.querySelector('[data-fullscreen-media]');
  captionEl  = document.querySelector('[data-fullscreen-caption]');
  closeBtn   = document.querySelector('[data-fullscreen-close]');
  if (!stage || !mediaWrap || !closeBtn) return;

  closeBtn.addEventListener('click', () => closeFullscreen());
}

export function openFullscreen(galleryItem) {
  if (!stage || state.isOpen || state.isAnimating) return;
  const sourceMedia = galleryItem.querySelector('picture, video');
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

  // Compute the target rect, position the caption, kick off the
  // transition to the target.
  const targetRect = computeTargetRect(clone);
  positionCaption(captionEl, targetRect);

  mediaWrap.style.transition = '';
  applyRect(mediaWrap, targetRect);
  stage.classList.add('is-open');

  setTimeout(() => {
    state.isOpen = true;
    state.isAnimating = false;
    // Try playing video with sound; if blocked, fall back to muted autoplay.
    tryPlayVideo(clone);
  }, prefersReducedMotion() ? 0 : ANIMATION_MS + 20);

  // Esc to close.
  escListener = (e) => {
    if (e.key === 'Escape') closeFullscreen();
  };
  document.addEventListener('keydown', escListener);
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
  }, prefersReducedMotion() ? 0 : ANIMATION_MS + 20);
}

/* ---------- Helpers ---------- */

function applyRect(el, rect) {
  el.style.top    = `${rect.top}px`;
  el.style.left   = `${rect.left}px`;
  el.style.width  = `${rect.width}px`;
  el.style.height = `${rect.height}px`;
}

function computeTargetRect(clone) {
  // Resolve aspect ratio from the underlying image/video. For a cloned
  // <picture>, drop in to the inner <img>.
  let aspect = 16 / 9; // safe default
  if (clone.tagName === 'PICTURE') {
    const img = clone.querySelector('img');
    if (img?.naturalWidth && img.naturalHeight) {
      aspect = img.naturalWidth / img.naturalHeight;
    }
  } else if (clone.tagName === 'IMG' && clone.naturalWidth && clone.naturalHeight) {
    aspect = clone.naturalWidth / clone.naturalHeight;
  } else if (clone.tagName === 'VIDEO' && clone.videoWidth && clone.videoHeight) {
    aspect = clone.videoWidth / clone.videoHeight;
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
