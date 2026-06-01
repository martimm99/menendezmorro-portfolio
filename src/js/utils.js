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
  if (lines.length === 0) return;
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
}
