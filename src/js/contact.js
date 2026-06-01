/**
 * contact.js — Contact page entry.
 *
 * Renders the site-wide contactCopy paragraphs and social links from
 * site.json, wires Get in touch and back-to-home, and triggers the
 * arrival reveal animation (BUILD_SPEC §2 line reveal for the copy,
 * BUILD_SPEC §5.2-style whole-element reveal for the static chrome).
 *
 * Timing: the reveal trigger waits ~900ms when this page was arrived
 * at via the Phase 10 vertical sweep, so the first elements come up
 * just as the sweep finishes; on a direct URL hit / reload it fires
 * almost immediately (60ms) to avoid an unnecessary empty beat.
 *
 * Stagger:
 *   - Get in touch CTA              0ms (top of the page)
 *   - Contact text                  0ms first line, +80ms per line
 *   - Static back arrow             at (max-line-delay + 80ms)
 *   - INSTAGRAM info row            at (max-line-delay + 160ms,
 *                                       last on the page)
 */

import {
  copyText,
  showToast,
  escapeHtml,
  wrapTextInRevealLines,
  assignRevealLineDelays,
  arrivedViaViewTransition,
  forceRevealAndNavigate,
  prefersReducedMotion
} from './utils.js';

const LINE_REVEAL_DELAY_PER_LINE_MS = 80;
const REVEAL_TRIGGER_DELAY_DIRECT_MS = 60;
const REVEAL_TRIGGER_DELAY_AFTER_SWEEP_MS = 900;

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
  // assignRevealLineDelays can read accurate line tops. The returned
  // last-line delay is stashed on the container so triggerReveal can
  // chain the static info row to start after the text finishes.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const lastLineDelayMs = assignRevealLineDelays(container, LINE_REVEAL_DELAY_PER_LINE_MS);
      container.dataset.lastLineDelay = String(lastLineDelayMs);
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
  // Each info-cell is its own clip; the inner .reveal-up wrapper is
  // the slide target. Wrapping happens here (not in HTML) because
  // the cells are populated from site.json.
  container.innerHTML = socials
    .map((s) => `
      <div class="info-cell reveal-clip">
        <div class="reveal-up">
          <dt>${escapeHtml(s.label)}</dt>
          <dd><a href="${encodeURI(s.url)}" target="_blank" rel="noopener">${escapeHtml(s.displayText)}</a></dd>
        </div>
      </div>
    `)
    .join('');
}

function setupNavigation(site) {
  // Logo and back arrow both return to Home via cross-document VT.
  // Force every reveal target into its visible state before the
  // navigation so the OLD snapshot captures the page fully revealed
  // (otherwise a close-click that lands before the 900ms reveal
  // delay would yield an empty contact snapshot — the bug we hit
  // for first-arrival fast clicks).
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
  const copyContainer = document.querySelector('[data-contact-copy]');
  if (!copyContainer) return;

  // Stagger delays for the whole-element reveals. Read the per-line
  // delay that renderCopy stashed (assigned inside two rAFs, so we
  // also wait two rAFs before reading it here).
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const lastLineDelayMs = Number(copyContainer.dataset.lastLineDelay || 0);

      setStaggerDelay('.site-logo > .reveal-up', 0);
      setStaggerDelay('.static-get-in-touch > .reveal-up', 0);
      setStaggerDelay('.static-back-arrow > .reveal-up', lastLineDelayMs + 80);
      document.querySelectorAll('.static-info-row .info-cell > .reveal-up').forEach((el, i) => {
        el.style.setProperty('--reveal-delay', `${lastLineDelayMs + 160 + i * 80}ms`);
      });

      const start = prefersReducedMotion()
        ? 0
        : (arrivedViaViewTransition()
            ? REVEAL_TRIGGER_DELAY_AFTER_SWEEP_MS
            : REVEAL_TRIGGER_DELAY_DIRECT_MS);
      setTimeout(() => {
        copyContainer.classList.add('reveal-in');
        document.body.classList.add('reveal-landing-in');
      }, start);
    });
  });
}

function setStaggerDelay(selector, delayMs) {
  document.querySelectorAll(selector).forEach((el) => {
    el.style.setProperty('--reveal-delay', `${delayMs}ms`);
  });
}
