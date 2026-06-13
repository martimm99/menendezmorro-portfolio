/**
 * cursor.js — custom dot cursor.
 *
 * A small accent-colored dot follows the mouse with a slight
 * damped-spring delay (see Movement notes below); the dot grows on
 * hover over interactive elements (anchors, project titles, the
 * Get-in-touch CTA, etc.). The native system cursor is hidden
 * site-wide (via base.css) while this runs.
 *
 * Skipped on touch / coarse-pointer devices and for users with
 * prefers-reduced-motion. In both cases base.css restores the native
 * cursor automatically (the `display: none` rule on .custom-cursor
 * remains, and the `cursor: none` rule on `*` does NOT apply because
 * its @media query fails).
 *
 * Movement: damped-spring physics. Each frame, the dot is pulled
 * toward the mouse by a force proportional to the distance
 * (SPRING_STIFFNESS), and its velocity is bled off by friction
 * (SPRING_DAMPING). The integrated velocity produces symmetric
 * ease-in-out — slow start, fast middle, slow end — instead of the
 * ease-out-only profile a plain lerp gives. Lower stiffness =
 * laggier; higher damping = smoother but slower; if damping is too
 * low for the stiffness the dot would overshoot and oscillate, so
 * the defaults sit comfortably on the no-overshoot side.
 *
 * Hover detection: a single delegated mouseover/mouseout pair on the
 * document, using `closest(HOVER_SELECTOR)` so hovering a deep child
 * of an interactive element still triggers the grow. The mouseout
 * checks `relatedTarget` so moving between two children of the same
 * interactive doesn't toggle off and back on.
 */

const HOVER_SELECTOR = 'a, button, .project-title, [data-action-copy-email], [data-nav-home], [data-nav-contact], .gallery-item, [data-fullscreen-stage].is-open';
const SPRING_STIFFNESS = 0.07;
const SPRING_DAMPING = 0.55;
// Sub-pixel threshold below which the spring is considered "settled."
// Hitting this on both axes for both position-delta AND velocity
// pauses the RAF loop until the next mousemove restarts it — there's
// no point burning 60 frames/sec drawing the same pixel.
const SETTLE_EPSILON = 0.05;

let cursor = null;
let mouseX = 0;
let mouseY = 0;
let cursorX = 0;
let cursorY = 0;
let velocityX = 0;
let velocityY = 0;
let isActive = false;
let rafId = null;
let lastTimestamp = 0;

export function initCursor() {
  // Bail on touch / coarse-pointer devices and reduced-motion users.
  // base.css mirrors this guard so the native cursor stays visible.
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  cursor = document.createElement('div');
  cursor.className = 'custom-cursor';
  cursor.setAttribute('aria-hidden', 'true');
  document.body.appendChild(cursor);

  document.addEventListener('mousemove', onMouseMove, { passive: true });
  document.addEventListener('mouseover', onMouseOver, { passive: true });
  document.addEventListener('mouseout', onMouseOut, { passive: true });
  document.addEventListener('mouseleave', onWindowLeave);
  // No mouseenter listener needed — the first mousemove after re-entry
  // already triggers the !isActive branch in onMouseMove, which warps
  // the dot to the new cursor position without spring slingshot.
}

function startTick() {
  if (rafId === null) {
    lastTimestamp = 0; // reset so the first tick treats itself as a normal 60fps frame
    rafId = requestAnimationFrame(tick);
  }
}

function onMouseMove(e) {
  mouseX = e.clientX;
  mouseY = e.clientY;
  if (!isActive) {
    // First move after init / window re-entry — jump the dot to the
    // mouse and reset velocity so the spring doesn't slingshot in
    // from (0, 0) or the previous resting position.
    cursorX = mouseX;
    cursorY = mouseY;
    velocityX = 0;
    velocityY = 0;
    isActive = true;
    cursor.classList.add('is-active');
  }
  // Resume the animation loop if it had settled. No-op if already
  // running. This is what lets the loop sleep when the mouse is
  // stationary — every fresh mousemove kicks it back on.
  startTick();
}

function onMouseOver(e) {
  // The fullscreen media is inside the stage (which is a hover target), but
  // hovering over the media itself should NOT grow the cursor — it's just
  // a viewing area, not a clickable action.
  if (e.target.closest?.('[data-fullscreen-media]')) {
    cursor.classList.remove('is-hover');
    return;
  }
  if (e.target.closest?.(HOVER_SELECTOR)) {
    cursor.classList.add('is-hover');
  }
}

function onMouseOut(e) {
  // Moving from media back to the stage empty area: the following mouseover
  // on the stage will re-add is-hover, so no special handling needed here.
  if (e.target.closest?.('[data-fullscreen-media]')) return;

  const from = e.target.closest?.(HOVER_SELECTOR);
  const to   = e.relatedTarget?.closest?.(HOVER_SELECTOR);
  const toMedia = e.relatedTarget?.closest?.('[data-fullscreen-media]');

  // from === to means we're moving within the same hover target (e.g., two
  // children of the same link). Remove hover only when actually leaving,
  // or when entering the media (which suppresses hover).
  if (from && (from !== to || toMedia)) {
    cursor.classList.remove('is-hover');
  }
}

function onWindowLeave() {
  isActive = false;
  cursor.classList.remove('is-active', 'is-hover');
}

function tick(timestamp) {
  // Normalize elapsed time to 60fps frame units (dt=1 at 60Hz, 0.5 at 120Hz, etc.).
  // If lastTimestamp is 0 (first frame after resume) or the gap is huge (tab was hidden),
  // treat it as a single normal frame so the spring doesn't jump.
  const elapsed = lastTimestamp ? timestamp - lastTimestamp : 1000 / 60;
  lastTimestamp = timestamp;
  const dt = elapsed > 200 ? 1 : elapsed / (1000 / 60);

  // Spring: force toward target, integrated through velocity.
  // All three steps are scaled by dt so the curve is identical at any refresh rate.
  const dx = mouseX - cursorX;
  const dy = mouseY - cursorY;
  velocityX += dx * SPRING_STIFFNESS * dt;
  velocityY += dy * SPRING_STIFFNESS * dt;
  velocityX *= Math.pow(1 - SPRING_DAMPING, dt);
  velocityY *= Math.pow(1 - SPRING_DAMPING, dt);
  cursorX += velocityX * dt;
  cursorY += velocityY * dt;
  cursor.style.transform = `translate3d(${cursorX}px, ${cursorY}px, 0) translate(-50%, -50%)`;

  // Settled? Snap to target to wipe sub-pixel drift, then park the
  // loop. Next mousemove will resume it via startTick(). This is the
  // perf win: a stationary cursor consumes no CPU.
  if (Math.abs(dx) < SETTLE_EPSILON && Math.abs(dy) < SETTLE_EPSILON &&
      Math.abs(velocityX) < SETTLE_EPSILON && Math.abs(velocityY) < SETTLE_EPSILON) {
    cursorX = mouseX;
    cursorY = mouseY;
    cursor.style.transform = `translate3d(${mouseX}px, ${mouseY}px, 0) translate(-50%, -50%)`;
    rafId = null;
    return;
  }

  rafId = requestAnimationFrame(tick);
}
