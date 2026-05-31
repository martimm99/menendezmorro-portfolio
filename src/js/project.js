/**
 * project.js — Project page entry.
 *
 * Resolves the URL slug to a project, updates document head metadata, and
 * hands the project's media off to the gallery module. Phase 7 will extend
 * this module with the Description section render, static elements (Get in
 * touch, info row, back arrow), and the Snap transition between sections.
 *
 * For Phase 6, an unmatched slug silently redirects to / and loads Home
 * (per the question answered up-front in Phase 6 planning).
 */

import { initGallery } from './gallery.js';

let teardown = null;

export function initProject(data, slug) {
  const project = data.projects.find((p) => p.slug === slug);
  if (!project) {
    // Unknown slug: drop the bad URL from history and reload as Home.
    window.history.replaceState(null, '', '/');
    window.dispatchEvent(new CustomEvent('route-change', { detail: { url: '/' } }));
    return;
  }

  updateHead(data.site, project);
  setupNavigationStubs();

  const gallery = document.querySelector('[data-gallery]');
  const track = document.querySelector('[data-gallery-track]');
  const prevBtn = document.querySelector('[data-gallery-prev]');
  const nextBtn = document.querySelector('[data-gallery-next]');

  teardown?.destroy?.();
  teardown = initGallery({
    items: project.media,
    projectTitle: project.title,
    gallery,
    track,
    prevBtn,
    nextBtn,
    onItemActivate: (index) => {
      // Phase 8 will open the Image fullscreen modal here.
      console.info(`gallery: open fullscreen for ${project.slug} index ${index}`);
    }
  });
}

function updateHead(site, project) {
  document.title = `${project.title} — ${site.siteTitle}`;
  const metaDescription = document.querySelector('meta[name="description"]');
  if (metaDescription) metaDescription.setAttribute('content', project.description || site.siteDescription);
  const ogTitle = document.querySelector('meta[property="og:title"]');
  if (ogTitle) ogTitle.setAttribute('content', `${project.title} — ${site.siteTitle}`);
  const ogDescription = document.querySelector('meta[property="og:description"]');
  if (ogDescription) ogDescription.setAttribute('content', project.description || site.siteDescription);
  const ogUrl = document.querySelector('meta[property="og:url"]');
  if (ogUrl) ogUrl.setAttribute('content', `${site.siteUrl}/${project.slug}`);
  const canonical = document.querySelector('link[rel="canonical"]');
  if (canonical) canonical.setAttribute('href', `${site.siteUrl}/${project.slug}`);
}

function setupNavigationStubs() {
  // The logo and Contact link are present in the Project header even
  // before Phase 7 wires the static elements. They should still feel
  // like in-app navigation (no page reload).
  const logo = document.querySelector('[data-nav-home]');
  if (logo) {
    logo.addEventListener('click', (e) => {
      e.preventDefault();
      window.history.pushState(null, '', '/');
      window.dispatchEvent(new CustomEvent('route-change', { detail: { url: '/' } }));
    });
  }
  const contact = document.querySelector('[data-nav-contact]');
  if (contact) {
    contact.addEventListener('click', (e) => {
      e.preventDefault();
      window.history.pushState(null, '', '/contact');
      window.dispatchEvent(new CustomEvent('route-change', { detail: { url: '/contact' } }));
    });
  }
}
