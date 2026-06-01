/**
 * project.js — Project page entry.
 *
 * Resolves the URL slug to a project, updates document head metadata,
 * renders the static chrome (Get in touch, info row, back arrow), wires
 * the gallery, populates the description section, and orchestrates the
 * snap transition between gallery and description.
 *
 * Per BUILD_SPEC.md §5.2:
 *   - Click "Get in touch" copies the contact email to the clipboard and
 *     shows a centered "Email copied" toast that fades after ~2s.
 *   - Back arrow and the page logo both return to / (Phase 10 will swap
 *     the full reload for a vertical sweep).
 *   - Info row shows LINKS / DURATION / COST. The LINKS cell hides when
 *     project.links is empty (per spec §6.1).
 *   - Long description text appears in the Description section with the
 *     Line reveal animation when the section first becomes visible.
 *   - Snap to Description: wheel forward at the end of the gallery, or
 *     vertical swipe up on mobile.
 *   - Snap back: wheel up at the top of description's scroll, or vertical
 *     swipe down on mobile.
 *
 * An unknown slug silently redirects to / so a typo lands somewhere
 * sensible instead of throwing.
 */

import { initGallery } from './gallery.js';
import { copyText, showToast, escapeHtml, prefersReducedMotion } from './utils.js';

const SNAP_DURATION_MS = 1000;
const LINE_REVEAL_DELAY_PER_LINE_MS = 80;

let teardown = null;
let snapState = { showDescription: false, isAnimating: false };
let touchStart = null;

export function initProject(data, slug) {
  const project = data.projects.find((p) => p.slug === slug);
  if (!project) {
    window.history.replaceState(null, '', '/');
    window.dispatchEvent(new CustomEvent('route-change', { detail: { url: '/' } }));
    return;
  }

  updateHead(data.site, project);
  renderInfoRow(project);
  renderDescription(project);
  setupNavigation(data.site);
  setupSnapTransition();

  const galleryAPI = initGallery({
    items: project.media,
    projectTitle: project.title,
    gallery: document.querySelector('[data-gallery]'),
    track: document.querySelector('[data-gallery-track]'),
    prevBtn: document.querySelector('[data-gallery-prev]'),
    nextBtn: document.querySelector('[data-gallery-next]'),
    onItemActivate: (index) => {
      console.info(`gallery: open fullscreen for ${project.slug} index ${index}`);
    },
    onForwardAtEnd: snapToDescription
  });

  teardown = galleryAPI;
}

/* ---------- Head metadata ---------- */

function updateHead(site, project) {
  document.title = `${project.title} — ${site.siteTitle}`;
  setMeta('meta[name="description"]', 'content', project.description || site.siteDescription);
  setMeta('meta[property="og:title"]', 'content', `${project.title} — ${site.siteTitle}`);
  setMeta('meta[property="og:description"]', 'content', project.description || site.siteDescription);
  setMeta('meta[property="og:url"]', 'content', `${site.siteUrl}/${project.slug}`);
  setMeta('link[rel="canonical"]', 'href', `${site.siteUrl}/${project.slug}`);
}

function setMeta(selector, attr, value) {
  const el = document.querySelector(selector);
  if (el) el.setAttribute(attr, value);
}

/* ---------- Static info row ---------- */

function renderInfoRow(project) {
  const linksCell = document.querySelector('[data-info-cell="links"]');
  const linksSlot = document.querySelector('[data-info-links]');
  if (linksCell && linksSlot) {
    if (project.links && project.links.length > 0) {
      linksCell.hidden = false;
      linksSlot.innerHTML = project.links
        .map((l) => `<a href="${encodeURI(l.url)}" target="_blank" rel="noopener">${escapeHtml(l.text)}</a>`)
        .join('');
    } else {
      linksCell.hidden = true;
    }
  }
  const durationSlot = document.querySelector('[data-info-duration]');
  if (durationSlot) durationSlot.textContent = project.duration || '';
  const costSlot = document.querySelector('[data-info-cost]');
  if (costSlot) costSlot.textContent = project.cost || '';
}

/* ---------- Description content ---------- */

function renderDescription(project) {
  const container = document.querySelector('[data-description-content]');
  if (!container) return;

  // Spec Appendix C: long descriptions are CMS-authored and currently
  // empty in projects.json. Until the CMS lands, fall back to a clearly-
  // labeled placeholder so the section is visible.
  const text = project.longDescription
    || `${project.description}\n\nLong description coming soon — to be authored via the Decap CMS.`;

  const paragraphs = text.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  container.innerHTML = paragraphs
    .map((p, i) => `
      <p class="description-paragraph">
        <span class="reveal-line-clip">
          <span class="reveal-line" style="--reveal-delay: ${i * LINE_REVEAL_DELAY_PER_LINE_MS}ms;">${escapeHtml(p)}</span>
        </span>
      </p>
    `)
    .join('');
}

/* ---------- Navigation + chrome wiring ---------- */

function setupNavigation(site) {
  // Logo and back arrow both return to Home with a full reload (Phase 10
  // will replace this with a vertical sweep).
  document.querySelectorAll('[data-nav-home]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      window.location.assign('/');
    });
  });

  // Get in touch: copy email + toast.
  const getInTouch = document.querySelector('[data-action-copy-email]');
  if (getInTouch && site.contactEmail) {
    getInTouch.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        const ok = await copyText(site.contactEmail);
        if (ok) {
          showToast('Email copied');
        } else {
          window.location.href = `mailto:${site.contactEmail}`;
        }
      } catch {
        window.location.href = `mailto:${site.contactEmail}`;
      }
    });
  }
}

/* ---------- Snap transition (gallery <-> description) ---------- */

function setupSnapTransition() {
  const descriptionSection = document.querySelector('[data-section-description]');
  if (!descriptionSection) return;

  // Intercept wheel-up at top of description to snap back to gallery.
  descriptionSection.addEventListener('wheel', (e) => {
    if (!snapState.showDescription || snapState.isAnimating) return;
    if (e.deltaY < 0 && descriptionSection.scrollTop <= 0) {
      e.preventDefault();
      snapToGallery();
    }
  }, { passive: false });

  // Mobile vertical swipe — listen on document so a swipe that starts
  // over a static element (info row, back arrow, header logo) still
  // triggers the snap. Those static elements are siblings of .project-
  // shell in the DOM, so a shell-scoped listener would miss them.
  document.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, { passive: true });

  document.addEventListener('touchend', (e) => {
    if (!touchStart || snapState.isAnimating) { touchStart = null; return; }
    const end = e.changedTouches[0];
    if (!end) { touchStart = null; return; }
    const dx = end.clientX - touchStart.x;
    const dy = end.clientY - touchStart.y;
    touchStart = null;
    // Vertical swipe must dominate, and clear the small-gesture floor.
    if (Math.abs(dy) < Math.abs(dx) * 1.2) return;
    if (Math.abs(dy) < 50) return;
    if (dy < 0 && !snapState.showDescription) {
      snapToDescription();
    } else if (dy > 0 && snapState.showDescription && descriptionSection.scrollTop <= 0) {
      snapToGallery();
    }
  }, { passive: true });

  document.addEventListener('touchcancel', () => { touchStart = null; }, { passive: true });
}

function snapToDescription() {
  if (snapState.showDescription || snapState.isAnimating) return;
  const shell = document.querySelector('[data-project-shell]');
  const descriptionSection = document.querySelector('[data-section-description]');
  const descriptionContent = document.querySelector('[data-description-content]');
  if (!shell || !descriptionSection) return;

  snapState.showDescription = true;
  snapState.isAnimating = true;
  shell.classList.add('show-description');
  descriptionSection.setAttribute('aria-hidden', 'false');

  const reduced = prefersReducedMotion();
  const animDelay = reduced ? 0 : Math.round(SNAP_DURATION_MS * 0.6);
  setTimeout(() => {
    descriptionContent?.classList.add('reveal-in');
  }, animDelay);

  setTimeout(() => {
    snapState.isAnimating = false;
  }, reduced ? 0 : SNAP_DURATION_MS);
}

function snapToGallery() {
  if (!snapState.showDescription || snapState.isAnimating) return;
  const shell = document.querySelector('[data-project-shell]');
  const descriptionSection = document.querySelector('[data-section-description]');
  const descriptionContent = document.querySelector('[data-description-content]');
  if (!shell || !descriptionSection) return;

  snapState.showDescription = false;
  snapState.isAnimating = true;
  shell.classList.remove('show-description');
  descriptionSection.setAttribute('aria-hidden', 'true');
  if (descriptionSection.scrollTop) descriptionSection.scrollTop = 0;

  const reduced = prefersReducedMotion();
  setTimeout(() => {
    descriptionContent?.classList.remove('reveal-in');
    snapState.isAnimating = false;
  }, reduced ? 0 : SNAP_DURATION_MS);
}
