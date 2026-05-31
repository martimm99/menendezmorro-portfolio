/**
 * gallery.js — Project page gallery interactions.
 *
 * Renders the project's media list as a horizontal filmstrip and wires up
 * desktop wheel scroll, drag, mobile arrow buttons, touch swipe, and video
 * autoplay observation. Captions appear as small overlays at the bottom-left
 * of each item when present.
 *
 * Per BUILD_SPEC.md §5.2:
 *   - Scroll always controls the gallery; ~30% of visible width per event.
 *   - No keyboard navigation in the regular view (arrow keys only in
 *     Image fullscreen, which is Phase 8).
 *   - Past the last image, wheel forward should trigger a Snap transition
 *     to the Description section — that snap arrives in Phase 7; for now
 *     a forward-at-end wheel event is a no-op.
 *   - Click/tap on a media item opens Image fullscreen (Phase 8). Phase 6
 *     calls onItemActivate, which logs until Phase 8 wires the modal.
 *
 * Videos autoplay when ≥ 90% visible (IntersectionObserver threshold 0.9)
 * and pause otherwise. They have no controls in the gallery; fullscreen
 * adds native controls.
 */

import { prefersReducedMotion } from './utils.js';

const SCROLL_FRACTION = 0.3;          // 30% of visible width per wheel event
const DRAG_CLICK_THRESHOLD = 5;       // px; movement above this counts as drag
const SWIPE_THRESHOLD = 50;           // px; minimum horizontal swipe distance
const VIDEO_VISIBILITY_THRESHOLD = 0.9;

/**
 * Initialize the gallery for the current project.
 * @param {Object}   opts
 * @param {Array}    opts.items           media array (project.media)
 * @param {string}   opts.projectTitle    used for fallback alt text
 * @param {Element}  opts.gallery         the .gallery container
 * @param {Element}  opts.track           the .gallery-track inner element
 * @param {Element}  opts.prevBtn         the previous-image button (mobile)
 * @param {Element}  opts.nextBtn         the next-image button (mobile)
 * @param {Function} [opts.onItemActivate] called with (index) when an item is clicked
 */
export function initGallery({ items, projectTitle, gallery, track, prevBtn, nextBtn, onItemActivate }) {
  if (!items?.length || !gallery || !track) return;

  renderItems({ items, projectTitle, track, onItemActivate });

  const videoObserver = observeVideos(track);
  setupWheel({ gallery, track });
  setupDrag({ gallery, track, onItemActivate });
  setupTouch({ gallery, track });
  setupArrows({ prevBtn, nextBtn, gallery, track });

  return {
    destroy() {
      videoObserver?.disconnect();
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
        // setupDrag may flag a recent click as a drag; respect that flag.
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
  // Spec §9: eager-load the first two; lazy-load the rest.
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

function setupWheel({ gallery, track }) {
  // The wheel handler is attached to the gallery container so it works
  // anywhere on the page, per spec §5.2 "scroll always controls the
  // gallery regardless of cursor position".
  gallery.addEventListener('wheel', (e) => {
    const delta = pickAxis(e.deltaX, e.deltaY);
    if (delta === 0) return;
    const step = gallery.clientWidth * SCROLL_FRACTION * Math.sign(delta);
    const max = trackMaxScroll(track, gallery);
    const current = currentScroll(track);
    const next = clamp(current + step, 0, max);
    // Phase 7 will replace this no-op-at-edges with the Snap-to-Description.
    if (next === current) return;
    e.preventDefault();
    applyScroll(track, next);
  }, { passive: false });
}

function pickAxis(dx, dy) {
  return Math.abs(dx) > Math.abs(dy) ? dx : dy;
}

/* ---------- Drag (pointer) ---------- */

function setupDrag({ gallery, track, onItemActivate }) {
  let pointerId = null;
  let startX = 0;
  let startScroll = 0;
  let dragged = false;

  gallery.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pointerId = e.pointerId;
    startX = e.clientX;
    startScroll = currentScroll(track);
    dragged = false;
    gallery.setPointerCapture(pointerId);
  });

  gallery.addEventListener('pointermove', (e) => {
    if (pointerId !== e.pointerId) return;
    const dx = e.clientX - startX;
    if (Math.abs(dx) < DRAG_CLICK_THRESHOLD) return;
    dragged = true;
    const max = trackMaxScroll(track, gallery);
    const next = clamp(startScroll - dx, 0, max);
    applyScroll(track, next, /* instant */ true);
  });

  gallery.addEventListener('pointerup', (e) => {
    if (pointerId !== e.pointerId) return;
    if (dragged && onItemActivate) {
      // A drag just ended on top of a media item. Suppress the next click
      // so the click-to-fullscreen handler doesn't fire.
      track.dataset.suppressNextClick = '1';
    }
    try { gallery.releasePointerCapture(pointerId); } catch {}
    pointerId = null;
  });

  gallery.addEventListener('pointercancel', () => { pointerId = null; });
}

/* ---------- Touch (mobile swipe) ---------- */

function setupTouch({ gallery, track }) {
  // Pointer events already handle touch drag. This handler exists so a
  // quick swipe (movement above SWIPE_THRESHOLD with little time elapsed)
  // advances by one viewport-width step, matching the mobile "horizontal
  // swipe = navigate between images" expectation.
  let startX = 0;
  let startTime = 0;
  let active = false;

  gallery.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) { active = false; return; }
    startX = e.touches[0].clientX;
    startTime = performance.now();
    active = true;
  }, { passive: true });

  gallery.addEventListener('touchend', (e) => {
    if (!active) return;
    active = false;
    const endX = e.changedTouches[0]?.clientX ?? startX;
    const dx = endX - startX;
    const elapsed = performance.now() - startTime;
    if (Math.abs(dx) < SWIPE_THRESHOLD || elapsed > 400) return;
    // pointermove drag already moved the track; nothing further needed here.
    // This event hook is reserved for "swipe = next/prev image step" in a
    // later refinement; current behavior keeps free-drag without snapping.
  }, { passive: true });
}

/* ---------- Arrow buttons (mobile) ---------- */

function setupArrows({ prevBtn, nextBtn, gallery, track }) {
  if (!prevBtn || !nextBtn) return;

  // Reveal arrows on mobile only. CSS hides them by default; we toggle the
  // hidden attribute based on a media query so screen readers also skip
  // them on desktop.
  const mql = window.matchMedia('(max-width: 768px)');
  const apply = () => {
    prevBtn.hidden = !mql.matches;
    nextBtn.hidden = !mql.matches;
  };
  apply();
  mql.addEventListener?.('change', apply);

  prevBtn.addEventListener('click', () => step(track, gallery, -1));
  nextBtn.addEventListener('click', () => step(track, gallery, +1));
}

function step(track, gallery, direction) {
  const max = trackMaxScroll(track, gallery);
  const stepSize = gallery.clientWidth * SCROLL_FRACTION;
  const next = clamp(currentScroll(track) + direction * stepSize, 0, max);
  applyScroll(track, next);
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
        v.play().catch(() => { /* autoplay blocked; ignore */ });
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
  // We translate the track rather than using native scrollLeft so the
  // visual position is decoupled from any browser scroll-restore.
  const v = Math.max(0, value);
  if (instant || prefersReducedMotion()) {
    track.style.transition = 'none';
  } else {
    track.style.transition = `transform ${0.35}s var(--ease-ui, ease)`;
  }
  track.style.transform = `translate3d(-${v}px, 0, 0)`;
}

function trackMaxScroll(track, gallery) {
  // The track's full width minus the visible viewport width.
  return Math.max(0, track.scrollWidth - gallery.clientWidth);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
