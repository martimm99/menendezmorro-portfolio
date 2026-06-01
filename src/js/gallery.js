/**
 * gallery.js — Project page gallery interactions.
 *
 * Renders the project's media list as a horizontal filmstrip and wires up
 * desktop wheel scroll, drag, mobile arrow buttons, and video autoplay
 * observation. Captions appear as small overlays at the bottom-left of each
 * item when present.
 *
 * Per BUILD_SPEC.md §5.2:
 *   - Desktop: scroll always controls the gallery; ~30% of visible width
 *     per event, with a step-lock so a quick wheel gesture doesn't stack
 *     into traversing the whole row.
 *   - Mobile: each image fits the viewport horizontally with small
 *     margins. Native scroll-snap drives the row; touch-action: pan-x on
 *     the track lets vertical swipes propagate to the snap handler in
 *     project.js.
 *   - When the gallery reaches its right edge and the user keeps scrolling
 *     forward, onForwardAtEnd() fires so project.js can snap to the
 *     description section.
 *   - Click/tap activates onItemActivate(index); Phase 8 will open the
 *     Image fullscreen modal there.
 *
 * The exported initGallery returns an API ({ destroy }) the caller can use
 * to tear handlers down on navigation.
 */

import { prefersReducedMotion } from './utils.js';

const SCROLL_FRACTION = 0.3;
const SCROLL_TRANSITION_MS = 350;
const DRAG_CLICK_THRESHOLD = 5;
const VIDEO_VISIBILITY_THRESHOLD = 0.9;

export function initGallery({
  items,
  projectTitle,
  gallery,
  track,
  prevBtn,
  nextBtn,
  onItemActivate,
  onForwardAtEnd
}) {
  if (!items?.length || !gallery || !track) return { destroy() {} };

  renderItems({ items, projectTitle, track, onItemActivate });

  const videoObserver = observeVideos(track);
  const mqlMobile = window.matchMedia('(max-width: 768px)');

  // Desktop-only: JS-driven horizontal scroll. Mobile uses native scroll.
  const wheelCleanup = setupWheel({ gallery, track, mqlMobile, onForwardAtEnd });
  const dragCleanup  = setupDrag({ gallery, track, mqlMobile, onItemActivate });
  const arrowCleanup = setupArrows({ prevBtn, nextBtn, gallery, track, mqlMobile });

  return {
    destroy() {
      videoObserver?.disconnect();
      wheelCleanup?.();
      dragCleanup?.();
      arrowCleanup?.();
    }
  };
}

/* ---------- Rendering ---------- */

function renderItems({ items, projectTitle, track, onItemActivate }) {
  track.innerHTML = '';
  const frag = document.createDocumentFragment();
  items.forEach((media, index) => {
    const fig = document.createElement('figure');
    fig.className = 'gallery-item';
    fig.dataset.index = String(index);

    if (media.type === 'video') {
      fig.appendChild(buildVideo(media, projectTitle, index));
    } else {
      fig.appendChild(buildPicture(media, projectTitle, index));
    }

    const caption = document.createElement('figcaption');
    caption.className = 'gallery-caption';
    if (media.caption) caption.textContent = media.caption;
    fig.appendChild(caption);

    if (onItemActivate) {
      fig.addEventListener('click', (e) => {
        if (track.dataset.suppressNextClick === '1') {
          delete track.dataset.suppressNextClick;
          return;
        }
        e.preventDefault();
        onItemActivate(index);
      });
    }

    frag.appendChild(fig);
  });
  track.appendChild(frag);
}

function buildPicture(media, projectTitle, index) {
  const src = '/' + media.src.replace(/^\//, '');
  const ext = src.match(/\.[^.]+$/)?.[0] ?? '';
  const base = src.slice(0, -ext.length);
  const mobileWebp = `${base}-mobile.webp`;
  const desktopWebp = `${base}-desktop.webp`;
  const alt = media.alt || `${projectTitle} image ${index + 1}`;

  const picture = document.createElement('picture');

  const mobileSrc = document.createElement('source');
  mobileSrc.media = '(max-width: 768px)';
  mobileSrc.type = 'image/webp';
  mobileSrc.srcset = mobileWebp;

  const desktopSrc = document.createElement('source');
  desktopSrc.type = 'image/webp';
  desktopSrc.srcset = desktopWebp;

  const img = document.createElement('img');
  img.src = src;
  img.alt = alt;
  img.decoding = 'async';
  if (index < 2) {
    img.loading = 'eager';
    if ('fetchPriority' in img) img.fetchPriority = index === 0 ? 'high' : 'low';
  } else {
    img.loading = 'lazy';
    if ('fetchPriority' in img) img.fetchPriority = 'low';
  }

  picture.appendChild(mobileSrc);
  picture.appendChild(desktopSrc);
  picture.appendChild(img);
  return picture;
}

function buildVideo(media, projectTitle, index) {
  const src = '/' + media.src.replace(/^\//, '');
  const video = document.createElement('video');
  video.src = src;
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = index < 2 ? 'metadata' : 'none';
  video.setAttribute('aria-label', media.alt || `${projectTitle} video ${index + 1}`);
  if (media.poster) video.poster = '/' + media.poster.replace(/^\//, '');
  return video;
}

/* ---------- Wheel (desktop) ---------- */

function setupWheel({ gallery, track, mqlMobile, onForwardAtEnd }) {
  let isAnimating = false;
  let animationTimer = null;

  const handler = (e) => {
    if (mqlMobile.matches) return; // mobile uses native scroll
    if (isAnimating) {
      e.preventDefault();
      return;
    }

    const delta = pickAxis(e.deltaX, e.deltaY);
    if (delta === 0) return;

    const max = trackMaxScroll(track, gallery);
    const current = currentScroll(track);
    const step = gallery.clientWidth * SCROLL_FRACTION * Math.sign(delta);
    const next = clamp(current + step, 0, max);

    if (next !== current) {
      e.preventDefault();
      isAnimating = true;
      applyScroll(track, next);
      clearTimeout(animationTimer);
      animationTimer = setTimeout(() => { isAnimating = false; }, SCROLL_TRANSITION_MS + 20);
      return;
    }

    // Already at an edge. Forward-at-end triggers the snap to Description.
    if (delta > 0 && current >= max && onForwardAtEnd) {
      e.preventDefault();
      onForwardAtEnd();
    }
  };

  gallery.addEventListener('wheel', handler, { passive: false });
  return () => {
    clearTimeout(animationTimer);
    gallery.removeEventListener('wheel', handler);
  };
}

function pickAxis(dx, dy) {
  return Math.abs(dx) > Math.abs(dy) ? dx : dy;
}

/* ---------- Drag (pointer) ---------- */

function setupDrag({ gallery, track, mqlMobile, onItemActivate }) {
  let pointerId = null;
  let startX = 0;
  let startScroll = 0;
  let dragged = false;

  const down = (e) => {
    if (mqlMobile.matches) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pointerId = e.pointerId;
    startX = e.clientX;
    startScroll = currentScroll(track);
    dragged = false;
    gallery.setPointerCapture(pointerId);
  };
  const move = (e) => {
    if (pointerId !== e.pointerId) return;
    const dx = e.clientX - startX;
    if (Math.abs(dx) < DRAG_CLICK_THRESHOLD) return;
    dragged = true;
    const max = trackMaxScroll(track, gallery);
    const next = clamp(startScroll - dx, 0, max);
    applyScroll(track, next, /* instant */ true);
  };
  const up = (e) => {
    if (pointerId !== e.pointerId) return;
    if (dragged && onItemActivate) {
      track.dataset.suppressNextClick = '1';
    }
    try { gallery.releasePointerCapture(pointerId); } catch {}
    pointerId = null;
  };
  const cancel = () => { pointerId = null; };

  gallery.addEventListener('pointerdown', down);
  gallery.addEventListener('pointermove', move);
  gallery.addEventListener('pointerup', up);
  gallery.addEventListener('pointercancel', cancel);
  return () => {
    gallery.removeEventListener('pointerdown', down);
    gallery.removeEventListener('pointermove', move);
    gallery.removeEventListener('pointerup', up);
    gallery.removeEventListener('pointercancel', cancel);
  };
}

/* ---------- Arrow buttons (mobile) ---------- */

function setupArrows({ prevBtn, nextBtn, gallery, track, mqlMobile }) {
  if (!prevBtn || !nextBtn) return null;

  const apply = () => {
    prevBtn.hidden = !mqlMobile.matches;
    nextBtn.hidden = !mqlMobile.matches;
  };
  apply();
  mqlMobile.addEventListener?.('change', apply);

  const prev = () => stepMobileArrow(track, -1);
  const next = () => stepMobileArrow(track, +1);
  prevBtn.addEventListener('click', prev);
  nextBtn.addEventListener('click', next);

  return () => {
    mqlMobile.removeEventListener?.('change', apply);
    prevBtn.removeEventListener('click', prev);
    nextBtn.removeEventListener('click', next);
  };
}

function stepMobileArrow(track, direction) {
  // Mobile uses native scroll with snap. Step by one snap-aligned item.
  const items = Array.from(track.querySelectorAll('.gallery-item'));
  if (items.length === 0) return;
  const itemWidth = items[0].getBoundingClientRect().width;
  const gap = parseFloat(getComputedStyle(track).gap) || 0;
  const offset = direction * (itemWidth + gap);
  track.scrollBy({ left: offset, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
}

/* ---------- Video autoplay observer ---------- */

function observeVideos(track) {
  if (!('IntersectionObserver' in window)) return null;
  const videos = Array.from(track.querySelectorAll('video'));
  if (videos.length === 0) return null;

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const v = entry.target;
      if (entry.intersectionRatio >= VIDEO_VISIBILITY_THRESHOLD) {
        v.play().catch(() => {});
      } else {
        v.pause();
      }
    }
  }, { threshold: VIDEO_VISIBILITY_THRESHOLD });

  videos.forEach((v) => observer.observe(v));
  return observer;
}

/* ---------- Scroll helpers ---------- */

function currentScroll(track) {
  const transform = track.style.transform;
  const match = transform.match(/translate3d\(-?([\d.]+)px,/);
  return match ? Number(match[1]) : 0;
}

function applyScroll(track, value, instant = false) {
  const v = Math.max(0, value);
  if (instant || prefersReducedMotion()) {
    track.style.transition = 'none';
  } else {
    track.style.transition = `transform ${SCROLL_TRANSITION_MS}ms var(--ease-ui, ease)`;
  }
  track.style.transform = `translate3d(-${v}px, 0, 0)`;
}

function trackMaxScroll(track, gallery) {
  return Math.max(0, track.scrollWidth - gallery.clientWidth);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
