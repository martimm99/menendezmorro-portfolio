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
const VIDEO_VISIBILITY_THRESHOLD = 0.5;

export function initGallery({
  items,
  projectTitle,
  gallery,
  track,
  prevBtn,
  nextBtn,
  onItemActivate,
  onDrag
}) {
  if (!items?.length || !gallery || !track) return { destroy() {}, step() {}, isMobile: () => false };

  renderItems({ items, projectTitle, track, onItemActivate });

  const mqlMobile = window.matchMedia('(max-width: 768px)');
  const videoObserver = observeVideos(track, gallery, mqlMobile);

  // Wheel handling lives in project.js. Gallery exposes step()
  // instead; project.js's wheel handler owns all the throttling and
  // calls step() once per real gesture.
  const dragCleanup  = setupDrag({ gallery, track, mqlMobile, onItemActivate, onDrag });
  const arrowCleanup = setupArrows({ prevBtn, nextBtn, gallery, track, mqlMobile });

  // The track's CSS padding-right: var(--page-pad-x) naturally
  // right-aligns the last image (its right edge sits at --page-pad-x
  // from the viewport right), mirroring image 1's left home position.
  // No JS override needed — clear any stale inline value from a
  // previous session so the CSS variable takes effect.
  track.style.paddingRight = '';

  // Step API. Snaps to the next image past the current LIVE scroll
  // position (not the last snapped target), so a mouse-wheel click
  // after a free-scrolled touchpad swipe still lands the user on
  // the real next/previous image even if the scroll position is
  // between two image positions. Returns a status string so the
  // caller knows whether the gallery moved or sat at an edge.
  //
  // Items are matched by their snap target:
  //   - Image 0 (first) → target 0 (left home position).
  //   - Last image → trackMaxScroll (right-aligned, right edge at --page-pad-x).
  //   - All others → centered (item.center − gallery.center).
  function step(direction) {
    if (mqlMobile.matches) return 'mobile';
    const allItems = track.querySelectorAll('.gallery-item');
    if (allItems.length === 0) return 'empty';

    const currentPos = readLiveScroll(track);
    const galleryHalf = gallery.clientWidth / 2;
    const epsilon = 0.5;             // sub-pixel tolerance

    const targetForIndex = (i) => {
      if (i === 0) return 0;
      if (i === allItems.length - 1) return trackMaxScroll(track, gallery);
      return Math.max(0, allItems[i].offsetLeft + allItems[i].offsetWidth / 2 - galleryHalf);
    };

    if (direction > 0) {
      for (let i = 0; i < allItems.length; i++) {
        if (targetForIndex(i) > currentPos + epsilon) {
          snapToIndex(track, allItems, i, /* instant */ false, gallery);
          return 'stepped';
        }
      }
      return 'at-end';
    } else {
      for (let i = allItems.length - 1; i >= 0; i--) {
        if (targetForIndex(i) < currentPos - epsilon) {
          snapToIndex(track, allItems, i, /* instant */ false, gallery);
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
    snapToIndex(track, allItems, 0, /* instant */ true, gallery);
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
    isMobile: () => mqlMobile.matches,
    getProgress: () => {
      if (mqlMobile.matches) {
        const max = track.scrollWidth - track.clientWidth;
        return max > 0 ? Math.min(Math.max(track.scrollLeft / max, 0), 1) : 0;
      }
      // readLiveScroll reads the *animated* transform (getComputedStyle) rather
      // than the inline-style target so the progress bar tracks the CSS
      // transition frame-by-frame instead of snapping to the end position.
      const max = trackMaxScroll(track, gallery);
      return max > 0 ? Math.min(Math.max(readLiveScroll(track) / max, 0), 1) : 0;
    },
    // Returns the *target* gallery progress using the inline-style transform
    // (currentScroll), not the live animated position. Used by the discrete
    // mouse-wheel path so the progress fill can be driven with its own CSS
    // transition toward the correct destination rather than trailing the
    // gallery's animation via rAF.
    getTargetProgress: () => {
      if (mqlMobile.matches) {
        const max = track.scrollWidth - track.clientWidth;
        return max > 0 ? Math.min(Math.max(track.scrollLeft / max, 0), 1) : 0;
      }
      const max = trackMaxScroll(track, gallery);
      return max > 0 ? Math.min(Math.max(currentScroll(track) / max, 0), 1) : 0;
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
  video.preload = 'metadata';
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

function snapToIndex(track, items, index, instant, gallery) {
  // Image 0 → left-aligned (scroll = 0, sits at CSS padding-left).
  // Last image → right-aligned (right edge at --page-pad-x from viewport
  //   right), mirroring image 1. trackMaxScroll gives that position when
  //   padding-right = var(--page-pad-x).
  // All others → centered on the viewport's horizontal middle.
  let target;
  if (index === 0) {
    target = 0;
  } else if (index === items.length - 1) {
    target = trackMaxScroll(track, gallery);
  } else {
    target = Math.max(0, items[index].offsetLeft + items[index].offsetWidth / 2 - gallery.clientWidth / 2);
  }
  applyScroll(track, target, instant);
}

export function pickAxis(dx, dy) {
  return Math.abs(dx) > Math.abs(dy) ? dx : dy;
}

/* ---------- Drag (pointer) ---------- */

function setupDrag({ gallery, track, mqlMobile, onItemActivate, onDrag }) {
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
    onDrag?.();
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

function setupArrows({ prevBtn, nextBtn, track, mqlMobile }) {
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
  // Mobile uses native scroll with snap. Find the currently centred item,
  // then scrollTo the next/prev item's snap position directly. Using scrollTo
  // (not scrollBy with items[0]'s width) is necessary because items can have
  // different widths (videos vs images) and the delta approach can overshoot
  // or undershoot, landing on the wrong snap point.
  const items = Array.from(track.querySelectorAll('.gallery-item'));
  if (items.length === 0) return;

  const viewportHalf = track.clientWidth / 2;
  const scrollCenter = track.scrollLeft + viewportHalf;

  let currentIdx = 0;
  let minDist = Infinity;
  for (let i = 0; i < items.length; i++) {
    const dist = Math.abs(items[i].offsetLeft + items[i].offsetWidth / 2 - scrollCenter);
    if (dist < minDist) { minDist = dist; currentIdx = i; }
  }

  const targetIdx = Math.max(0, Math.min(items.length - 1, currentIdx + direction));
  if (targetIdx === currentIdx) return;

  const target = items[targetIdx];
  const snapLeft = Math.max(0, target.offsetLeft + target.offsetWidth / 2 - viewportHalf);
  track.scrollTo({ left: snapLeft, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
}

/* ---------- Video autoplay observer ---------- */

function observeVideos(track, gallery, mqlMobile) {
  const videos = Array.from(track.querySelectorAll('video'));
  if (videos.length === 0) return null;
  if (!('IntersectionObserver' in window)) return null;

  // Mobile: IntersectionObserver on each video (viewport root, 0.9 threshold).
  // Full-width items mean at most one video is ≥90% visible at a time.
  if (mqlMobile.matches) {
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.intersectionRatio >= VIDEO_VISIBILITY_THRESHOLD) {
          entry.target.play().catch(() => {});
        } else {
          entry.target.pause();
        }
      }
    }, { threshold: VIDEO_VISIBILITY_THRESHOLD });
    videos.forEach((v) => io.observe(v));
    return io;
  }

  // Desktop: only the video closest to the gallery's horizontal centre plays.
  //
  // Pre-compute video → gallery-item mapping once (items don't change after
  // render) to avoid a closest() traversal on every syncPlayback() call.
  //
  // currentScroll() reads track.style.transform (the inline target) rather
  // than getComputedStyle (which animates mid-transition), so play/pause
  // resolves to the post-snap position before the animation completes.
  const videoItems = new Map();
  for (const v of videos) {
    const item = v.closest('.gallery-item');
    if (item) videoItems.set(v, item);
  }

  // Cache item center positions and gallery half-width so syncPlayback
  // has zero layout reads per call. Refreshed via ResizeObserver on resize
  // and after each video's loadedmetadata fires (item dimensions may shift
  // before the video's intrinsic size is known).
  let galleryHalf = gallery.clientWidth / 2;
  const itemCenters = new Map();
  for (const [video, item] of videoItems) {
    itemCenters.set(video, item.offsetLeft + item.offsetWidth / 2);
  }

  function refreshCache() {
    galleryHalf = gallery.clientWidth / 2;
    for (const [video, item] of videoItems) {
      itemCenters.set(video, item.offsetLeft + item.offsetWidth / 2);
    }
  }

  // Guard playback so videos never start before the gallery is in view.
  let isGalleryVisible = false;

  for (const video of videos) {
    video.addEventListener('loadedmetadata', () => { refreshCache(); if (isGalleryVisible) syncPlayback(); }, { once: true });
  }

  function syncPlayback() {
    const scroll = currentScroll(track);
    let bestVideo = null;
    let minDist = Infinity;
    for (const [video] of videoItems) {
      const dist = Math.abs((itemCenters.get(video) ?? 0) - scroll - galleryHalf);
      if (dist < minDist) { minDist = dist; bestVideo = video; }
    }
    for (const video of videos) {
      if (video === bestVideo) video.play().catch(() => {});
      else video.pause();
    }
  }

  function pauseAll() { videos.forEach((v) => v.pause()); }

  // Fires on every applyScroll() call (track.style.transform changes).
  const styleMo = new MutationObserver(() => { if (isGalleryVisible) syncPlayback(); });
  styleMo.observe(track, { attributeFilter: ['style'] });

  // Refresh position cache when the gallery resizes.
  const resizeObs = new ResizeObserver(refreshCache);
  resizeObs.observe(gallery);

  // Pause all when the gallery leaves the viewport (user is in description section).
  // On first entry, videos start from the beginning because play() was never called.
  const galleryIo = new IntersectionObserver(([entry]) => {
    isGalleryVisible = entry.isIntersecting;
    if (entry.isIntersecting) syncPlayback();
    else pauseAll();
  }, { threshold: 0.1 });
  galleryIo.observe(gallery);

  return { disconnect() { styleMo.disconnect(); galleryIo.disconnect(); resizeObs.disconnect(); } };
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
