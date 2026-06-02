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
const GESTURE_GAP_MS = 80;             // wheel events more than this far apart start a new gesture
const INERTIA_DELTA_THRESHOLD = 3;     // |delta| below this is treated as inertia tail and ignored
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
  onForwardAtEnd,
  isActive
}) {
  if (!items?.length || !gallery || !track) return { destroy() {} };

  renderItems({ items, projectTitle, track, onItemActivate });

  const videoObserver = observeVideos(track);
  const mqlMobile = window.matchMedia('(max-width: 768px)');

  // Desktop-only: JS-driven horizontal scroll. Mobile uses native scroll.
  const wheelCleanup = setupWheel({ gallery, track, mqlMobile, onForwardAtEnd, isActive });
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

function setupWheel({ gallery, track, mqlMobile, onForwardAtEnd, isActive }) {
  // One wheel gesture → exactly one image step, regardless of gesture
  // length. A touchpad swipe sends ~16ms-spaced wheel events for as long
  // as the fingers move plus a ~300ms inertia tail; only the first event
  // of that burst should advance the gallery, and the rest are absorbed
  // here. A mouse wheel click is a single event with a long gap before
  // the next, so it also reads as "one gesture → one step." Drag is
  // intentionally NOT routed through this — it stays as the free-scroll
  // pointer handler so a power user can still pull the track by hand.
  //
  // The listener is on window, not on .gallery, so wheel events arrive
  // regardless of where the cursor sits (especially over static elements
  // like the info row or back arrow, which are siblings of project-shell
  // and don't bubble through gallery). The isActive callback gates the
  // handler so it stays silent while the description section is showing
  // or while the snap animation is running — project.js's description
  // handler takes over in those states.
  let isAnimating = false;
  let animationTimer = null;
  let lastWheelAt = 0;

  const handler = (e) => {
    if (isActive && !isActive()) return; // description showing or snap animating
    if (mqlMobile.matches) return;        // mobile uses native scroll-snap

    const delta = pickAxis(e.deltaX, e.deltaY);
    if (delta === 0) return;

    // Take control of the wheel — we don't want native scroll fighting
    // the JS-driven snap, and the page itself doesn't scroll anyway.
    e.preventDefault();

    // Touchpad inertia decays exponentially from the swipe's peak delta
    // down to near zero. Filtering events below INERTIA_DELTA_THRESHOLD
    // (without updating lastWheelAt) cuts the long tail of "real-event"
    // bookkeeping that would otherwise keep extending the burst window
    // past the user's second swipe.
    if (Math.abs(delta) < INERTIA_DELTA_THRESHOLD) return;

    const isNewGesture = (e.timeStamp - lastWheelAt) > GESTURE_GAP_MS;
    lastWheelAt = e.timeStamp;
    if (!isNewGesture) return;
    if (isAnimating) return;

    const items = track.querySelectorAll('.gallery-item');
    if (items.length === 0) return;

    // Resolve "current image" from the actual scroll position so a
    // drag-induced offset doesn't desync the snap target.
    const index = getCurrentIndex(track, items);

    if (delta > 0) {
      if (index < items.length - 1) {
        snapToIndex(track, items, index + 1);
        startAnimationLock();
      } else if (onForwardAtEnd) {
        // At the last image and still swiping forward → hand off to the
        // snap-to-Description transition managed by project.js.
        onForwardAtEnd();
      }
    } else {
      if (index > 0) {
        snapToIndex(track, items, index - 1);
        startAnimationLock();
      }
    }
  };

  function startAnimationLock() {
    isAnimating = true;
    clearTimeout(animationTimer);
    animationTimer = setTimeout(() => { isAnimating = false; }, SCROLL_TRANSITION_MS + 20);
  }

  // Capture phase, not bubble: on Chrome, after a cross-document view
  // transition the browser sometimes doesn't fire bubble-phase wheel
  // listeners on window until the cursor moves — events get stuck
  // routed to a stale target-resolution cache that only refreshes on
  // pointer motion. Capture phase flows window -> target before any
  // element-level handling, which bypasses that cache and makes
  // touchpad scroll responsive from page load without the user
  // having to nudge the cursor first.
  window.addEventListener('wheel', handler, { passive: false, capture: true });
  return () => {
    clearTimeout(animationTimer);
    window.removeEventListener('wheel', handler, { capture: true });
  };
}

function snapToIndex(track, items, index) {
  // items[0].offsetLeft accounts for the track's left padding; subtracting
  // it makes the target a pure scroll-distance value (image 0 → 0).
  const target = items[index].offsetLeft - items[0].offsetLeft;
  applyScroll(track, target);
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

function pickAxis(dx, dy) {
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
