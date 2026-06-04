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
 *   - Click/tap activates onItemActivate(index); the project page wires
 *     that callback to openFullscreen() from fullscreen.js.
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

  // Step API. Snaps to the next image past the current LIVE scroll
  // position (not the last snapped target), so a mouse-wheel click
  // after a free-scrolled touchpad swipe still lands the user on
  // the real next/previous image even if the scroll position is
  // between two image positions. Returns a status string so the
  // caller knows whether the gallery moved or sat at an edge.
  function step(direction) {
    if (mqlMobile.matches) return 'mobile';
    const allItems = track.querySelectorAll('.gallery-item');
    if (allItems.length === 0) return 'empty';

    const currentPos = readLiveScroll(track);
    const baseOffset = allItems[0].offsetLeft;
    const epsilon = 0.5;             // sub-pixel tolerance

    if (direction > 0) {
      for (let i = 0; i < allItems.length; i++) {
        const itemPos = allItems[i].offsetLeft - baseOffset;
        if (itemPos > currentPos + epsilon) {
          snapToIndex(track, allItems, i);
          return 'stepped';
        }
      }
      return 'at-end';
    } else {
      for (let i = allItems.length - 1; i >= 0; i--) {
        const itemPos = allItems[i].offsetLeft - baseOffset;
        if (itemPos < currentPos - epsilon) {
          snapToIndex(track, allItems, i);
          return 'stepped';
        }
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

  // Free-scroll: add delta to the current live scroll position,
  // clamped to [0, maxScroll], and apply the transform instantly
  // (no transition). Used by project.js's wheel handler while a
  // touchpad burst is in progress so the gallery tracks the
  // gesture in real time. Mobile is no-op (it has its own native
  // scroll-snap).
  function freeScrollDelta(delta) {
    if (mqlMobile.matches) return;
    const current = readLiveScroll(track);
    const max = trackMaxScroll(track, gallery);
    const next = clamp(current + delta, 0, max);
    applyScroll(track, next, /* instant */ true);
  }

  return {
    destroy() {
      videoObserver?.disconnect();
      dragCleanup?.();
      arrowCleanup?.();
    },
    step,
    resetToStart,
    freeScrollDelta,
    isAtStart: () => readLiveScroll(track) <= 1,
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

  // Arrow visibility is driven by both viewport (desktop hides both)
  // and current scroll position (mobile hides "prev" at the start
  // and "next" at the end — the corresponding direction is a no-op
  // there, so the arrow is misleading). The handler is called on
  // breakpoint change AND on every scroll event, so the visibility
  // stays in sync as the user scrolls through the gallery.
  const apply = () => {
    if (!mqlMobile.matches) {
      prevBtn.hidden = true;
      nextBtn.hidden = true;
      return;
    }
    const atStart = track.scrollLeft <= 1;
    const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 1;
    prevBtn.hidden = atStart;
    nextBtn.hidden = atEnd;
  };
  apply();
  mqlMobile.addEventListener?.('change', apply);
  track.addEventListener('scroll', apply, { passive: true });

  const prev = () => stepMobileArrow(track, -1);
  const next = () => stepMobileArrow(track, +1);
  prevBtn.addEventListener('click', prev);
  nextBtn.addEventListener('click', next);

  return () => {
    mqlMobile.removeEventListener?.('change', apply);
    track.removeEventListener('scroll', apply);
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

// Live scroll position — reads the *currently rendered* transform via
// getComputedStyle so a free-scroll handoff mid-snap-animation picks up
// the actual on-screen position, not the snap target. currentScroll
// (above) returns the target since it reads inline style.transform.
function readLiveScroll(track) {
  const cs = getComputedStyle(track).transform;
  if (cs === 'none' || !cs) return 0;
  // matrix(a, b, c, d, tx, ty) — 2D form
  const m2 = cs.match(/^matrix\(([^)]+)\)$/);
  if (m2) {
    const parts = m2[1].split(',').map((p) => Number(p.trim()));
    return -parts[4];
  }
  // matrix3d(... 12 zeros ..., tx, ty, tz, w) — 3D form
  const m3 = cs.match(/^matrix3d\(([^)]+)\)$/);
  if (m3) {
    const parts = m3[1].split(',').map((p) => Number(p.trim()));
    return -parts[12];
  }
  return 0;
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
