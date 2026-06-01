/**
 * contact.js — Contact page entry.
 *
 * Renders the site-wide contactCopy paragraphs and social links from
 * site.json, wires Get in touch and back-to-home, and triggers the
 * shared Line reveal on entry. Per BUILD_SPEC.md §5.3 the visual is
 * "identical to the current live site"; the only code-level
 * differences are the X back button (v1.6) and the email-copy toast
 * instead of a mailto link.
 *
 * Phase 10 will add the vertical sweep from Home / back to Home.
 */

import {
  copyText,
  showToast,
  escapeHtml,
  wrapTextInRevealLines,
  assignRevealLineDelays,
  prefersReducedMotion
} from './utils.js';

const REVEAL_TRIGGER_DELAY_MS = 60;
const LINE_REVEAL_DELAY_PER_LINE_MS = 80;

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
  // Two rAFs: first to commit the DOM, second to wait for layout.
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
  document.querySelectorAll('[data-nav-home]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      window.location.assign('/');
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
  const start = prefersReducedMotion() ? 0 : REVEAL_TRIGGER_DELAY_MS;
  setTimeout(() => container.classList.add('reveal-in'), start);
}
