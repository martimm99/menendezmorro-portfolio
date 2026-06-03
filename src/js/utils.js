/**
 * utils.js — shared helpers. Add a function here only when at least one
 * other module imports it. Speculative utilities don't belong in this file.
 */

export function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Copy text to the clipboard with a graceful fallback for older browsers
 * (or http contexts where navigator.clipboard is unavailable).
 */
export async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'absolute';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand?.('copy') ?? false;
  document.body.removeChild(ta);
  return ok;
}

let toastTimer = null;
let toastFadeTimer = null;

/**
 * Show a centered toast with the given message, fade out after ~2s.
 * Requires a [data-toast] element with a [data-toast-message] inside.
 */
export function showToast(message, duration = 2000) {
  const toast = document.querySelector('[data-toast]');
  if (!toast) return;
  const slot = toast.querySelector('[data-toast-message]');
  if (slot) slot.textContent = message;

  clearTimeout(toastTimer);
  clearTimeout(toastFadeTimer);

  toast.hidden = false;
  // Force a reflow so the opacity transition runs.
  // eslint-disable-next-line no-unused-expressions
  toast.offsetWidth;
  toast.classList.add('is-visible');

  toastTimer = setTimeout(() => {
    toast.classList.remove('is-visible');
    toastFadeTimer = setTimeout(() => {
      toast.hidden = true;
    }, 350);
  }, duration);
}

/**
 * Wrap each word of a paragraph in nested .reveal-line-clip /
 * .reveal-line spans so the Line reveal animation (spec §2) can drive
 * them. Whitespace runs are preserved so text wrapping happens at the
 * same points it would as plain text.
 *
 * Returns an HTML string. The caller is responsible for putting the
 * result into the DOM and then calling assignRevealLineDelays() to
 * group the words into visual lines.
 */
export function wrapTextInRevealLines(text) {
  const tokens = String(text).split(/(\s+)/);
  return tokens.map((t) => {
    if (t.length === 0) return '';
    if (/^\s+$/.test(t)) return t;
    return `<span class="reveal-line-clip"><span class="reveal-line">${escapeHtml(t)}</span></span>`;
  }).join('');
}

/**
 * After wrapped reveal markup is in the DOM, group .reveal-line elements
 * by their visual-line top position and stagger a --reveal-delay CSS
 * variable across lines, so each visual line rises together when the
 * container picks up the .reveal-in class.
 *
 * delayMs is the per-line stagger (80ms by default).
 */
export function assignRevealLineDelays(container, delayMs = 80) {
  const lines = container.querySelectorAll('.reveal-line');
  if (lines.length === 0) return 0;
  const groups = new Map();
  for (const line of lines) {
    const top = Math.round(line.getBoundingClientRect().top);
    if (!groups.has(top)) groups.set(top, []);
    groups.get(top).push(line);
  }
  const orderedTops = [...groups.keys()].sort((a, b) => a - b);
  orderedTops.forEach((top, lineIdx) => {
    const delay = lineIdx * delayMs;
    for (const line of groups.get(top)) {
      line.style.setProperty('--reveal-delay', `${delay}ms`);
    }
  });
  return (orderedTops.length - 1) * delayMs;
}

/**
 * Best-effort signal that this page load came from a cross-document
 * view transition (BUILD_SPEC §2 vertical sweep) rather than a direct
 * URL hit / reload / history navigation. When true, callers should
 * delay arrival reveal animations so they start ~when the sweep ends;
 * when false (direct visit), reveal can fire as soon as it would have
 * without any sweep in the picture.
 *
 * Heuristic: navigation type === 'navigate' AND same-origin referrer.
 * Reloads and back/forward hits don't trigger the @view-transition
 * rule, so they correctly fall to false; a direct URL hit (no
 * referrer) also falls to false.
 */
export function arrivedViaViewTransition() {
  if (typeof document.startViewTransition !== 'function') return false;
  const nav = performance.getEntriesByType('navigation')[0];
  if (!nav || nav.type !== 'navigate') return false;
  if (!document.referrer) return false;
  try {
    return new URL(document.referrer).origin === window.location.origin;
  } catch {
    return false;
  }
}

/**
 * Snap every reveal target on the page into its fully-visible state
 * (.reveal-snap) and then navigate to `url`. This guarantees the OLD
 * snapshot captured by the cross-document view transition shows the
 * page fully revealed, even if the user clicked away before the
 * natural reveal animation had a chance to finish. The forced layout
 * read between the class add and the navigation makes sure the snap
 * is committed before the snapshot fires.
 */
export function forceRevealAndNavigate(url) {
  document.body.classList.add('reveal-snap');
  // Force style recalc so the snap is reflected in the next snapshot.
  void document.body.offsetHeight;
  window.location.assign(url);
}

/**
 * Observe each .reveal-line-clip and reveal it the first time any
 * pixel of it crosses into the (shrunken) viewport. One-shot per clip.
 *
 * Two-phase reveal pattern used by the Project description and
 * Contact copy: the caller fires the on-screen clips directly so the
 * cascade waterfall (per-line --reveal-delay set by
 * assignRevealLineDelays) plays on first paint; off-screen clips are
 * passed here so each visual line animates as the user scrolls it
 * into view. The cascade delay is overridden to 0ms on intersection
 * so a scrolled-in line doesn't pause after entering view.
 *
 * rootMargin defaults to `0px 0px -20% 0px`: the bottom of the
 * intersection root is pulled up 20% of the viewport height, so a
 * line has to scroll ~20% past the actual viewport bottom before its
 * animation fires. Without that delay the animation runs while the
 * line is still in peripheral vision and only the tail is visible by
 * the time the line reaches the reading area.
 *
 * Older browsers without IntersectionObserver get an immediate
 * reveal of everything as a fallback.
 */
export function setupScrollReveal(clips, { threshold = 0, rootMargin = '0px 0px -20% 0px' } = {}) {
  if (!('IntersectionObserver' in window) || !clips?.length) {
    clips?.forEach?.((c) => c.classList.add('reveal-in'));
    return null;
  }
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const clip = entry.target;
      const line = clip.querySelector('.reveal-line');
      if (line) line.style.transitionDelay = '0ms';
      clip.classList.add('reveal-in');
      observer.unobserve(clip);
    }
  }, { threshold, rootMargin });
  for (const c of clips) observer.observe(c);
  return observer;
}
