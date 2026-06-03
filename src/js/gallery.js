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
  onItemActivate
}) {
  if (!items?.length || !gallery || !track) return { destroy() {}, step() {}, isMobile: () => false };

  renderItems({ items, projectTitle, track, onItemActivate });

  const videoObserver = observeVideos(track);
  const mqlMobile = window.matchMedia('(max-width: 768px)');

  // Wheel handling lives in project.js. Gallery exposes step()
  // instead; project.js's wheel handler owns all the throttling and
  // calls step() once per real gesture.
  const dragCleanup  = setupDrag({ gallery, track, mqlMobile, onItemActivate });
  const arrowCleanup = setupArrows({ prevBtn, nextBtn, gallery, track, mqlMobile });

  // Step API. Returns a status string so the caller knows whether
  // the gallery moved or sat at an edge — at-end-forward is the
  // signal that project.js should snap to description instead.
  function step(direction) {
    if (mqlMobile.matches) return 'mobile';
    const allItems = track.querySelectorAll('.gallery-item');
    if (allItems.length === 0) return 'empty';
    const index = getCurrentIndex(track, allItems);
    if (direction > 0) {
      if (index < allItems.length - 1) {
        snapToIndex(track, allItems, index + 1);
        return 'stepped';
      }
      return 'at-end';
    } else {
      if (index > 0) {
        snapToIndex(track, allItems, index - 1);
        return 'stepped';
      }
      return 'at-start';
    }
  }

  // Reset the gallery to its first item without animation. Used when
  // closing the gallery overlay so the next entry starts on image 1.
  function resetToStart() {
    const allItems = track.querySelectorAll('.gallery-item');
    if (allItems.length === 0) return;
    snapToIndex(track, allItems, 0, /* instant */ true);
  }

  return {
    destroy() {
      videoObserver?.disconnect();
      dragCleanup?.();
      arrowCleanup?.();
    },
    step,
    resetToStart,
    isAtStart: () => getCurrentIndex(track, track.querySelectorAll('.gallery-item')) === 0,
    isMobile: () => mqlMobile.matches
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

/* ---------- Wheel handling (gallery step) ----------
 *
 * The wheel listener for the gallery lives in project.js, not here.
 * Putting it here as a second window-level wheel listener (alongside
 * project.js's description snap-back listener) made Chrome's wheel
 * routing flaky between gestures — touchpad swipes required a cursor
 * nudge to re-engage. Home doesn't have that problem because home has
 * exactly one window wheel listener. So now project.js does too: it
 * calls galleryAPI.step(delta) on each wheel burst when in gallery
 * mode, and handles the snap-back path itself when in description
 * mode. */

function snapToIndex(track, items, index, instant = false) {
  // items[0].offsetLeft accounts for the track's left padding; subtracting
  // it makes the target a pure scroll-distance value (image 0 → 0).
  const target = items[index].offsetLeft - items[0].offsetLeft;
  applyScroll(track, target, instant);
}

function getCurrentIndex(track, items) {
  if (items.length === 0) return 0;
  const current = currentScroll(track);
  const baseOffset = items[0].offsetLeft;
  let closest = 0;
  let closestDist = Infinity;
  for (let i = 0; i < items.length; i++) {
    const itemPos = items[i].offsetLeft - baseOffset;
    const dist = Math.abs(itemPos - current);
    if (dist < closestDist) {
      closestDist = dist;
      closest = i;
    }
  }
  return closest;
}

export function pickAxis(dx, dy) {
  return Math.abs(dx) > Math.abs(dy) ? dx : dy;
}

/* ---------- Drag (pointer) ---------- */

function setupDrag({ gallery, track, mqlMobile, onItemActivate }) {
  let pointerId = null;
  let startX = 0;
  let startScroll = 0;
  let dragged = false;
  let captured = false;

  // IMPORTANT: setPointerCapture is intentionally NOT called on
  // pointerdown. With pointer capture active, the browser redirects
  // synthesized click events to the capturing element — so a plain
  // click on a gallery item never reaches the figure's click handler
  // (the click target becomes .gallery, which doesn't listen). Capture
  // is set only once we cross DRAG_CLICK_THRESHOLD so that drags still
  // continue when the cursor leaves the gallery, but a non-drag click
  // flows normally to the figure.
  const down = (e) => {
    if (mqlMobile.matches) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pointerId = e.pointerId;
    startX = e.clientX;
    startScroll = currentScroll(track);
    dragged = false;
    captured = false;
  };
  const move = (e) => {
    if (pointerId !== e.pointerId) return;
    const dx = e.clientX - startX;
    if (Math.abs(dx) < DRAG_CLICK_THRESHOLD) return;
    if (!dragged) {
      dragged = true;
      try {
        gallery.setPointerCapture(pointerId);
        captured = true;
      } catch {}
    }
    const max = trackMaxScroll(track, gallery);
    const next = clamp(startScroll - dx, 0, max);
    applyScroll(track, next, /* instant */ true);
  };
  const up = (e) => {
    if (pointerId !== e.pointerId) return;
    if (dragged && onItemActivate) {
      track.dataset.suppressNextClick = '1';
    }
    if (captured) {
      try { gallery.releasePointerCapture(pointerId); } catch {}
    }
    pointerId = null;
    captured = false;
  };
  const cancel = () => { pointerId = null; captured = false; };

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
