/**
 * home.js — Home page interactions.
 *
 * Responsibilities:
 *   - Render project[index]: cover (image or video), title, role, info row.
 *   - Handle wheel, drag (mouse/touch), and keyboard arrows → horizontal sweep.
 *   - Click on title or role → cross-shell navigation via
 *     window.location.assign('/<slug>'). Phase 10 will replace the reload
 *     with a vertical sweep.
 *   - Click on Contact link → in-shell router.navigateTo('/contact')
 *     (Contact is still the same home shell until Phase 9 ships a
 *     dedicated contact.html).
 *   - Preload adjacent covers with fetchpriority="low" via Image() prefetch.
 *
 * Per BUILD_SPEC.md §5.1, Home does not render captions on the cover, even
 * when the cover media item has one. The first media[0] is the cover.
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

function renderInitial() {
  const activeLayer = state.layers[state.activeLayerIdx];
  const project = state.data.projects[state.index];
  paintCover(activeLayer, project.media[0], project.title, /* high priority */ true);
  activeLayer.classList.add('is-active');
  // Only the "current" slot in each pair gets text. The "next" slot stays
  // empty until a navigation populates it (and promoteSlots clears it again).
  setSlotText('current', project);
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
    const cover = state.data.projects[i].media[0];
    if (cover.type !== 'image') continue;
    const src = '/' + cover.src.replace(/^\//, '');
    const ext = src.match(/\.[^.]+$/)?.[0] ?? '';
    const desktopWebp = src.slice(0, -ext.length) + '-desktop.webp';
    const img = new Image();
    if ('fetchPriority' in img) img.fetchPriority = 'low';
    img.src = desktopWebp;
  }
}

function setupClickHandlers() {
  document.querySelector('.project-title').addEventListener('click', goToCurrentProject);
  document.querySelector('.project-role').addEventListener('click', goToCurrentProject);
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
  // Cross-shell: a full reload fetches project.html from Netlify, which
  // initializes the project page. Phase 10 will swap this for a smooth
  // vertical-sweep transition.
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

    navigate(delta > 0 ? 'next' : 'prev');
    gestureActed = true;
  }, { passive: true });
}

function setupKeyboard() {
  window.addEventListener('keydown', (e) => {
    if (state.isAnimating) return;
    if (e.key === 'ArrowRight') navigate('next');
    else if (e.key === 'ArrowLeft') navigate('prev');
  });
}

function setupDrag() {
  let startX = null;
  let startY = null;
  let pointerId = null;
  const THRESHOLD = 50;
  const stage = document.querySelector('.cover-stage');
  if (!stage) return;

  stage.addEventListener('pointerdown', (e) => {
    if (state.isAnimating) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    startX = e.clientX;
    startY = e.clientY;
    pointerId = e.pointerId;
  });

  stage.addEventListener('pointerup', (e) => {
    if (pointerId !== e.pointerId || startX === null) {
      startX = null;
      pointerId = null;
      return;
    }
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    startX = null;
    pointerId = null;
    if (Math.abs(dx) < THRESHOLD || Math.abs(dx) < Math.abs(dy)) return;
    navigate(dx < 0 ? 'next' : 'prev');
  });

  stage.addEventListener('pointercancel', () => {
    startX = null;
    pointerId = null;
  });
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
  paintCover(nextLayer, nextProject.media[0], nextProject.title, /* high priority */ true);
  // Stop any video playing on the outgoing layer.
  const outgoingVideo = activeLayer.querySelector('video');
  if (outgoingVideo && state.videoObserver) state.videoObserver.unobserve(outgoingVideo);

  // Set the queued text values on the "next" slots in sync.
  setSlotText('next', nextProject);

  // Run cover sweep and text slide in parallel; they share duration and easing.
  const pairs = collectSlotPairs();
  await Promise.all([
    horizontalSweep({ activeLayer, nextLayer, direction }),
    slideTextSlots(pairs, direction)
  ]);

  promoteSlots();
  state.activeLayerIdx = 1 - state.activeLayerIdx;
  state.index = nextIndex;
  preloadAdjacent(state.index);
  state.isAnimating = false;
}
