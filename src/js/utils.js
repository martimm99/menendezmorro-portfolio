/**
 * utils.js — shared helpers. Add a function here only when at least one
 * other module imports it. Speculative utilities don't belong in this file.
 */

export function debounce(fn, wait) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function isMobileViewport() {
  return window.matchMedia('(max-width: 768px)').matches;
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
