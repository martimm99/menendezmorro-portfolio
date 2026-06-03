/**
 * contact.js — Contact page entry.
 *
 * Renders the site-wide contactCopy paragraphs and social links from
 * site.json, wires Get in touch and back-to-home, and triggers the
 * arrival line reveal animation on the contact copy.
 *
 * The Phase 10 vertical sweep is a bg-only clip-path animation on
 * the cross-document VT pseudo (see base.css). The page bg + every
 * static element sit at their final viewport positions during the
 * sweep, so there's no need to clip-and-slide them on arrival —
 * they're simply revealed as the sweep edge passes over them. Only
 * the per-line text reveal still runs as a separate post-sweep
 * effect.
 *
 * Timing: the reveal trigger waits ~1100ms when this page was
 * arrived at via the sweep, so the first line comes up just after
 * the sweep finishes; on a direct URL hit / reload it fires almost
 * immediately (60ms) to avoid an unnecessary empty beat.
 */

import {
  copyText,
  showToast,
  escapeHtml,
  wrapTextInRevealLines,
  assignRevealLineDelays,
  arrivedViaViewTransition,
  forceRevealAndNavigate,
  setupScrollReveal,
  prefersReducedMotion
} from './utils.js';

const LINE_REVEAL_DELAY_PER_LINE_MS = 80;
const REVEAL_TRIGGER_DELAY_DIRECT_MS = 60;
const REVEAL_TRIGGER_DELAY_AFTER_SWEEP_MS = 1100;

export function initContact(data) {
  const site = data.site;
  renderCopy(site.contactCopy);
  renderSocials(site.socials);
  setupNavigation(site);
  triggerReveal();
}

function renderCopy(paragraphs) {
  const container = document.querySelector('[data-contact-copy]');
  if (!container || !Array.isArray(paragraphs)) return;
  container.innerHTML = paragraphs
    .map((p) => `<p class="contact-paragraph">${wrapTextInRevealLines(p)}</p>`)
    .join('');
  // Two rAFs: first commits the DOM, second waits for layout so
  // assignRevealLineDelays can read accurate line tops.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      assignRevealLineDelays(container, LINE_REVEAL_DELAY_PER_LINE_MS);
    });
  });
}

function renderSocials(socials) {
  const container = document.querySelector('[data-contact-socials]');
  if (!container) return;
  if (!Array.isArray(socials) || socials.length === 0) {
    container.hidden = true;
    return;
  }
  container.innerHTML = socials
    .map((s) => `
      <div class="info-cell">
        <dt>${escapeHtml(s.label)}</dt>
        <dd><a href="${encodeURI(s.url)}" target="_blank" rel="noopener">${escapeHtml(s.displayText)}</a></dd>
      </div>
    `)
    .join('');
}

function setupNavigation(site) {
  // Logo and back arrow both return to Home via cross-document VT.
  // forceRevealAndNavigate snaps any in-flight line reveal to its
  // fully-visible state before navigation so the OLD snapshot the
  // closing sweep captures has the text shown rather than half-
  // animated (this matters most for users who click X within the
  // ~1100ms reveal delay).
  document.querySelectorAll('[data-nav-home]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      forceRevealAndNavigate('/');
    });
  });

  const getInTouch = document.querySelector('[data-action-copy-email]');
  if (getInTouch && site.contactEmail) {
    getInTouch.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        const ok = await copyText(site.contactEmail);
        if (ok) showToast('Email copied');
        else window.location.href = `mailto:${site.contactEmail}`;
      } catch {
        window.location.href = `mailto:${site.contactEmail}`;
      }
    });
  }
}

function triggerReveal() {
  const container = document.querySelector('[data-contact-copy]');
  if (!container) return;
  const clips = Array.from(container.querySelectorAll('.reveal-line-clip'));
  if (clips.length === 0) return;
  if (prefersReducedMotion()) {
    clips.forEach((c) => c.classList.add('reveal-in'));
    return;
  }
  // Two-phase reveal (same pattern as project.js triggerDescriptionReveal):
  // on-screen clips fire as a cascade waterfall via the per-line
  // --reveal-delay; off-screen clips are observed and fire individually
  // when they scroll into view, with the cascade delay reset to 0ms.
  // Trigger is delayed until the cross-document VT sweep ends so the
  // initially-visible lines don't start animating mid-sweep.
  const delay = arrivedViaViewTransition()
    ? REVEAL_TRIGGER_DELAY_AFTER_SWEEP_MS
    : REVEAL_TRIGGER_DELAY_DIRECT_MS;
  setTimeout(() => {
    const vh = window.innerHeight;
    const inView = [];
    const offView = [];
    for (const clip of clips) {
      const rect = clip.getBoundingClientRect();
      if (rect.bottom > 0 && rect.top < vh) inView.push(clip);
      else offView.push(clip);
    }
    for (const c of inView) c.classList.add('reveal-in');
    setupScrollReveal(offView);
  }, delay);
}
