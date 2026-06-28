/**
 * home.js — Home page interactions.
 *
 * Responsibilities:
 *   - Render project[index]: cover (image or video), title, role, info row.
 *   - Handle wheel, drag (mouse/touch), and keyboard arrows → horizontal sweep.
 *   - Click on title or role → cross-shell navigation via
 *     window.location.assign('/<slug>'). The cross-document View
 *     Transitions API (@view-transition in base.css) plays the
 *     vertical sweep automatically across the page change.
 *   - Click on Contact link → router.navigateTo('/contact'), which
 *     reloads the dedicated contact.html shell via the same sweep.
 *   - Preload adjacent covers with fetchpriority="low" via Image() prefetch.
 *
 * Per BUILD_SPEC.md §5.1, Home does not render captions on the cover.
 * The cover image is project.cover (with project.coverAlt); falls back to
 * media[0] when cover is absent so placeholder projects still render.
 */

import { horizontalSweep, slideTextSlots } from './transitions.js';
import { navigateTo } from './router.js';

let state = {
  data: null,
  index: 0,
  layers: [],   // [Element, Element]
  activeLayerIdx: 0,
  isAnimating: false,
  videoObserver: null
};

// --- Auto-advance timer ---
const TIMER_DURATION_MS = 7000;
const DRAIN_DURATION_MS = 500;
const HOVER_RAMP_MS     = 220;
const TIMER_BASE_OP     = 0.4;
const TIMER_FILL_OP     = 0.9;

const timerState = {
  btn: null,
  progress:      0,     // 0–1 over TIMER_DURATION_MS
  hoverStrength: 0,     // 0–1; ramps on mouseenter/leave of the button
  isHovering:    false, // true only when hovering the next-btn (ramps hoverStrength)
  isPaused:      false, // true when hovering the title (freezes everything, no ramp)
  draining:      false, // true while the post-fire drain animation plays
  drainProgress: 0,     // 1–0 over DRAIN_DURATION_MS
  rafId:         null,
  lastTimestamp: null,
};

export function initHome(data) {
  state.data = data;
  state.layers = Array.from(document.querySelectorAll('.cover-layer'));
  state.activeLayerIdx = 0;
  state.index = resumeIndex(data);

  initVideoObserver();
  renderInitial();
  preloadAdjacent(state.index);
  setupClickHandlers();
  setupWheel();
  setupKeyboard();
  setupDrag();
  initTimer();
  window.addEventListener('resize', () => {
    clearTimeout(scaleTitleResizeTimer);
    scaleTitleResizeTimer = setTimeout(scaleTitleForMobile, 100);
  }, { passive: true });
}

/**
 * Pick which project the Home cover should land on. If the user is
 * arriving from a project page (or any nav that left a project slug
 * in sessionStorage), resume on that project; otherwise default to
 * the first one. sessionStorage is per-tab and cleared on close, so a
 * fresh tab always starts on project 0.
 */
function resumeIndex(data) {
  let slug;
  try { slug = sessionStorage.getItem('lastProjectSlug'); } catch { return 0; }
  if (!slug) return 0;
  const idx = data.projects.findIndex((p) => p.slug === slug);
  return idx >= 0 ? idx : 0;
}

// Returns a media-item-shaped object for the project's home cover.
// Uses project.cover + project.coverAlt when present; falls back to
// media[0] so projects without a dedicated cover still render.
function getCover(project) {
  if (project.cover) {
    const type = /\.mp4$/i.test(project.cover) ? 'video' : 'image';
    return { type, src: project.cover, alt: project.coverAlt || `${project.title} cover` };
  }
  return project.media[0];
}

function renderInitial() {
  const activeLayer = state.layers[state.activeLayerIdx];
  const project = state.data.projects[state.index];
  paintCover(activeLayer, getCover(project), project.title, /* high priority */ true);
  activeLayer.classList.add('is-active');
  // Only the "current" slot in each pair gets text. The "next" slot stays
  // empty until a navigation populates it (and promoteSlots clears it again).
  setSlotText('current', project);
  // One rAF so layout has settled with the loaded font before measuring.
  requestAnimationFrame(scaleTitleForMobile);
}

function setSlotText(role, project) {
  const selector = role === 'current' ? '[data-slot-current]' : '[data-slot-next]';
  document.querySelector(`${selector}[data-project-title]`).textContent = project.title;
  document.querySelector(`${selector}[data-project-role]`).textContent  = project.role;
  document.querySelector(`${selector}[data-info-location]`).textContent = project.location;
  document.querySelector(`${selector}[data-info-year]`).textContent     = project.year;
  document.querySelector(`${selector}[data-info-description]`).textContent = project.description;
}

function collectSlotPairs() {
  const fields = ['project-title', 'project-role', 'info-location', 'info-year', 'info-description'];
  return fields.map((f) => ({
    current: document.querySelector(`[data-slot-current][data-${f}]`),
    next:    document.querySelector(`[data-slot-next][data-${f}]`)
  }));
}

// Promote the next-slot pair to current after a sweep. We copy the just-
// animated-in text onto the current slot and clear the next slot, so the
// next slot is invisible (empty) at default position — ready to be re-
// populated and re-animated on the following navigation.
function promoteSlots() {
  const pairs = collectSlotPairs();
  for (const { current, next } of pairs) {
    current.textContent = next.textContent;
    next.textContent = '';
    current.classList.add('is-active');
    next.classList.remove('is-active');
  }
}

function paintCover(layer, mediaItem, projectTitle, highPriority = false) {
  layer.innerHTML = '';
  if (mediaItem.type === 'video') {
    const video = renderVideo(mediaItem, projectTitle);
    layer.appendChild(video);
    state.videoObserver?.observe(video);
    return;
  }
  const picture = renderPicture(mediaItem, projectTitle, highPriority);
  layer.appendChild(picture);
}

function renderPicture(mediaItem, projectTitle, highPriority) {
  const src = '/' + mediaItem.src.replace(/^\//, '');
  const ext = src.match(/\.[^.]+$/)?.[0] ?? '';
  const base = src.slice(0, -ext.length);
  const mobileWebp = `${base}-mobile.webp`;
  const desktopWebp = `${base}-desktop.webp`;
  const alt = mediaItem.alt || `${projectTitle} cover`;

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
  img.loading = 'eager';
  img.decoding = 'async';
  if (highPriority && 'fetchPriority' in img) img.fetchPriority = 'high';

  picture.appendChild(mobileSrc);
  picture.appendChild(desktopSrc);
  picture.appendChild(img);
  return picture;
}

function renderVideo(mediaItem, projectTitle) {
  const src = '/' + mediaItem.src.replace(/^\//, '');
  const video = document.createElement('video');
  video.src = src;
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = 'metadata';
  video.setAttribute('aria-label', `${projectTitle} cover video`);
  if (mediaItem.poster) video.poster = '/' + mediaItem.poster.replace(/^\//, '');
  return video;
}

function initVideoObserver() {
  if (!('IntersectionObserver' in window)) return;
  state.videoObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const v = entry.target;
      if (entry.intersectionRatio >= 0.9) {
        v.play().catch(() => { /* autoplay blocked; ignore */ });
      } else {
        v.pause();
      }
    }
  }, { threshold: 0.9 });
}

function preloadAdjacent(index) {
  const count = state.data.projects.length;
  const prev = (index - 1 + count) % count;
  const next = (index + 1) % count;
  for (const i of new Set([prev, next])) {
    if (i === index) continue;
    const cover = getCover(state.data.projects[i]);
    if (cover.type !== 'image') continue;
    const src = '/' + cover.src.replace(/^\//, '');
    const ext = src.match(/\.[^.]+$/)?.[0] ?? '';
    const desktopWebp = src.slice(0, -ext.length) + '-desktop.webp';
    const img = new Image();
    if ('fetchPriority' in img) img.fetchPriority = 'low';
    img.src = desktopWebp;
  }
}

// Scale the mobile title font-size down when the longest word would overflow
// the available width. Runs after each navigation and on resize.
// Always clears any inline font-size first so a stale mobile-scaled value
// never persists when the viewport is wider than 599px.
let scaleTitleResizeTimer = null;
function scaleTitleForMobile() {
  const titleEl = document.querySelector('.project-title');
  if (!titleEl) return;
  titleEl.style.removeProperty('font-size');
  if (window.innerWidth > 599) return;
  const slot = titleEl.querySelector('[data-slot-current][data-project-title]');
  if (!slot) return;
  const text = slot.textContent.trim();
  if (!text) return;
  const longestWord = text.split(/\s+/).reduce((a, b) => a.length > b.length ? a : b, '');
  const temp = document.createElement('span');
  temp.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;font-size:inherit;font-family:inherit;font-weight:inherit;letter-spacing:inherit';
  temp.textContent = longestWord;
  titleEl.appendChild(temp);
  const wordWidth = temp.getBoundingClientRect().width;
  titleEl.removeChild(temp);
  const availableWidth = titleEl.getBoundingClientRect().width;
  if (wordWidth > availableWidth) {
    const currentSize = parseFloat(getComputedStyle(titleEl).fontSize);
    titleEl.style.fontSize = `${Math.floor(currentSize * (availableWidth / wordWidth))}px`;
  }
}

// Pre-scale the incoming title's slot-clip before the sweep animation so
// the text slides in already at the correct font-size, instead of inheriting
// the parent's stale value from the outgoing project.
//
// Sets font-size on the absolute slot-clip only — the parent is untouched so
// the outgoing text continues its leave animation at its own correct size.
// On desktop (>599px) the function only clears any stale mobile override.
function prescaleTitleForMobile(title) {
  const titleEl = document.querySelector('.project-title');
  if (!titleEl) return;
  const nextSlotClip = titleEl.querySelector('.slot-clip[aria-hidden="true"]');
  if (!nextSlotClip) return;
  // Always clear a stale value from the previous navigation.
  nextSlotClip.style.removeProperty('font-size');
  if (window.innerWidth > 599) {
    // On desktop, also clear any stale mobile-scaled value on the parent so
    // the incoming text inherits the correct CSS font-size.
    titleEl.style.removeProperty('font-size');
    return;
  }
  // Read the unscaled CSS mobile size directly from the token.
  const rawFs = getComputedStyle(document.documentElement)
    .getPropertyValue('--fs-title-mobile').trim();
  const cssFs = parseFloat(rawFs);
  if (!cssFs) return;
  const longestWord = title.split(/\s+/).reduce((a, b) => a.length > b.length ? a : b, '');
  const temp = document.createElement('span');
  temp.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font-size:${cssFs}px;font-family:inherit;font-weight:inherit;letter-spacing:inherit`;
  temp.textContent = longestWord;
  titleEl.appendChild(temp);
  const wordWidth = temp.getBoundingClientRect().width;
  titleEl.removeChild(temp);
  const availableWidth = titleEl.getBoundingClientRect().width;
  const scaledSize = wordWidth > availableWidth
    ? Math.floor(cssFs * (availableWidth / wordWidth))
    : cssFs;
  nextSlotClip.style.fontSize = `${scaledSize}px`;
}

function setupClickHandlers() {
  document.querySelector('.project-title').addEventListener('click', goToCurrentProject);
  document.querySelector('[data-nav-contact]').addEventListener('click', (e) => {
    e.preventDefault();
    navigateTo('/contact');
  });
  document.querySelector('[data-nav-home]')?.addEventListener('click', (e) => {
    // Logo on Home is a no-op per spec; intercept to prevent reload.
    e.preventDefault();
  });
}

function goToCurrentProject(e) {
  e.preventDefault();
  const project = state.data.projects[state.index];
  // Cross-shell: a full reload fetches project.html from Netlify,
  // which initializes the project page. The vertical-sweep transition
  // is handled automatically by the cross-document View Transitions
  // API (@view-transition rule in base.css) across the page change.
  window.location.assign(`/${project.slug}`);
}

function setupWheel() {
  // Spec §5.1: wheel/trackpad scroll maps to horizontal navigation.
  // One input gesture = one navigation, regardless of how long the
  // swipe is.
  //
  // Pattern: after a navigate fires, set a gestureActed flag and
  // ignore every subsequent wheel event until events stop arriving
  // for GESTURE_END_GAP_MS — at which point the gesture is over and
  // the flag resets so the next swipe navigates.
  //
  // Inertia filter: a very strong fling can keep firing wheel events
  // with sizeable deltas for well over a second, which would refresh
  // the gap timer indefinitely and make the user feel like swipes
  // "stop working" until they nudge the cursor (cursor motion is what
  // cancels Chrome's inertia delivery). Events with |delta| below
  // INERTIA_DELTA_THRESHOLD don't refresh the timer, so when inertia
  // decays into the tail it stops extending the window and the next
  // genuine swipe goes through.
  const GESTURE_END_GAP_MS = 100;
  const INERTIA_DELTA_THRESHOLD = 4;
  let lastEventAt = 0;
  let gestureActed = false;

  window.addEventListener('wheel', (e) => {
    if (state.isAnimating) return;

    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (delta === 0) return;

    // Inertia tail filter — don't refresh the gap timer with weak
    // events, and don't trigger a navigate from them either.
    if (Math.abs(delta) < INERTIA_DELTA_THRESHOLD) return;

    if (e.timeStamp - lastEventAt > GESTURE_END_GAP_MS) {
      gestureActed = false;
    }
    lastEventAt = e.timeStamp;

    if (gestureActed) return;

    userNavigate(delta > 0 ? 'next' : 'prev');
    gestureActed = true;
  }, { passive: true });
}

function setupKeyboard() {
  window.addEventListener('keydown', (e) => {
    if (state.isAnimating) return;
    if (e.key === 'ArrowRight') userNavigate('next');
    else if (e.key === 'ArrowLeft') userNavigate('prev');
  });
}

function setupDrag() {
  let startX = null;
  let startY = null;
  let pointerId = null;
  const THRESHOLD = 50;

  // Listen on document so swipes starting anywhere on screen work —
  // including over the title (z-index 70), which sits above .cover-stage.
  document.addEventListener('pointerdown', (e) => {
    if (state.isAnimating) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    startX = e.clientX;
    startY = e.clientY;
    pointerId = e.pointerId;
  });

  document.addEventListener('pointerup', (e) => {
    if (pointerId !== e.pointerId || startX === null) {
      startX = null;
      pointerId = null;
      return;
    }
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    startX = null;
    pointerId = null;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    // Dominant-axis classification. Ties (exactly 45°) go to horizontal so
    // a slightly diagonal left/right swipe always reads as horizontal.
    if (absDx >= THRESHOLD && absDx >= absDy) {
      userNavigate(dx < 0 ? 'next' : 'prev');
    } else if (absDy >= THRESHOLD && absDy > absDx) {
      userNavigate(dy < 0 ? 'next' : 'prev');
    }
  });

  document.addEventListener('pointercancel', () => {
    startX = null;
    pointerId = null;
  });
}

function initTimer() {
  timerState.btn = document.querySelector('.next-btn');
  if (!timerState.btn) return;

  timerState.btn.addEventListener('mouseenter', () => {
    timerState.isHovering = true;
    if (!timerState.rafId) {
      timerState.lastTimestamp = null;
      timerState.rafId = requestAnimationFrame(tickTimer);
    }
  });
  timerState.btn.addEventListener('mouseleave', () => {
    timerState.isHovering = false;
  });
  timerState.btn.addEventListener('click', () => userNavigate('next'));

  const title = document.querySelector('.project-title');
  if (title) {
    title.addEventListener('mouseenter', () => {
      timerState.isPaused = true;
    });
    title.addEventListener('mouseleave', () => {
      timerState.isPaused = false;
      timerState.lastTimestamp = null;
      if (!timerState.rafId) {
        timerState.rafId = requestAnimationFrame(tickTimer);
      }
    });
  }

  timerState.lastTimestamp = null;
  timerState.rafId = requestAnimationFrame(tickTimer);
}

// Called only by user-initiated navigation — fully resets timer and interrupts
// any in-progress drain so the button snaps cleanly to the new project state.
function resetTimer() {
  if (!timerState.btn) return;
  timerState.progress = 0;
  timerState.draining = false;
  timerState.drainProgress = 0;
  timerState.lastTimestamp = null;
  if (!timerState.rafId) {
    timerState.rafId = requestAnimationFrame(tickTimer);
  }
}

// User-initiated navigation: drains from the current visual position, then
// navigates. The drain speed is constant — if the button is 30% filled it
// empties in 30% of DRAIN_DURATION_MS, keeping the visual rate consistent.
// If the button is already empty there is nothing to drain, so reset is instant.
function userNavigate(direction) {
  const currentP = timerState.draining ? timerState.drainProgress : timerState.progress;
  if (currentP > 0) {
    timerState.draining = true;
    timerState.drainProgress = currentP;
    timerState.progress = 0;
    timerState.lastTimestamp = null;
    if (!timerState.rafId) {
      timerState.rafId = requestAnimationFrame(tickTimer);
    }
  } else {
    resetTimer();
  }
  navigate(direction);
}

function tickTimer(timestamp) {
  timerState.rafId = null;

  // Title hover: freeze everything in place. RAF restarts on mouseleave.
  if (timerState.isPaused && !timerState.isHovering) return;

  const dt = timerState.lastTimestamp !== null
    ? Math.min(timestamp - timerState.lastTimestamp, 200)
    : 0;
  timerState.lastTimestamp = timestamp;

  // Hover strength ramps smoothly on mouseenter/leave.
  // Hover also interrupts a drain in progress.
  const hoverDelta = dt / HOVER_RAMP_MS;
  if (timerState.isHovering) {
    timerState.hoverStrength = Math.min(1, timerState.hoverStrength + hoverDelta);
    if (timerState.draining) {
      timerState.draining = false;
      timerState.drainProgress = 0;
    }
  } else {
    timerState.hoverStrength = Math.max(0, timerState.hoverStrength - hoverDelta);
  }

  if (timerState.draining) {
    // Drain: gradient boundary retreats right-to-left over DRAIN_DURATION_MS.
    timerState.drainProgress -= dt / DRAIN_DURATION_MS;
    if (timerState.drainProgress <= 0) {
      timerState.drainProgress = 0;
      timerState.draining = false;
    }
  } else if (!state.isAnimating && !timerState.isHovering) {
    // Normal tick: advance toward 1.
    timerState.progress += dt / TIMER_DURATION_MS;

    if (timerState.progress >= 1) {
      timerState.progress = 0;
      timerState.draining = true;
      timerState.drainProgress = 1;
      timerState.lastTimestamp = null;
      applyTimerStyle();
      navigate('next');
      timerState.rafId = requestAnimationFrame(tickTimer);
      return;
    }
  }

  applyTimerStyle();
  timerState.rafId = requestAnimationFrame(tickTimer);
}

function applyTimerStyle() {
  if (!timerState.btn) return;
  const h = timerState.hoverStrength;
  const p = timerState.draining ? timerState.drainProgress : timerState.progress;
  const leftOp  = TIMER_FILL_OP + (1 - TIMER_FILL_OP) * h;
  const rightOp = TIMER_BASE_OP + (1 - TIMER_BASE_OP) * h;
  timerState.btn.style.setProperty('--progress', p.toFixed(4));
  timerState.btn.style.setProperty('--left-op',  leftOp.toFixed(3));
  timerState.btn.style.setProperty('--right-op', rightOp.toFixed(3));
}

async function navigate(direction) {
  if (state.isAnimating) return;
  const count = state.data.projects.length;
  const nextIndex = direction === 'next'
    ? (state.index + 1) % count
    : (state.index - 1 + count) % count;
  if (nextIndex === state.index) return;

  state.isAnimating = true;

  const activeLayer = state.layers[state.activeLayerIdx];
  const nextLayer = state.layers[1 - state.activeLayerIdx];
  const nextProject = state.data.projects[nextIndex];

  // Paint the destination cover into the hidden layer ahead of the sweep.
  paintCover(nextLayer, getCover(nextProject), nextProject.title, /* high priority */ true);
  // Stop any video playing on the outgoing layer.
  const outgoingVideo = activeLayer.querySelector('video');
  if (outgoingVideo && state.videoObserver) state.videoObserver.unobserve(outgoingVideo);

  // Set the queued text values on the "next" slots in sync.
  setSlotText('next', nextProject);
  // Pre-scale the incoming slot-clip to the correct font-size before the sweep
  // starts so the title slides in at the right size from frame one.
  prescaleTitleForMobile(nextProject.title);

  // Run cover sweep and text slide in parallel; they share duration and easing.
  const pairs = collectSlotPairs();
  await Promise.all([
    horizontalSweep({ activeLayer, nextLayer, direction }),
    slideTextSlots(pairs, direction)
  ]);

  promoteSlots();
  scaleTitleForMobile();
  state.activeLayerIdx = 1 - state.activeLayerIdx;
  state.index = nextIndex;
  preloadAdjacent(state.index);
  state.isAnimating = false;
}
