/**
 * main.js — entry point loaded by every HTML shell.
 *
 * Three shells exist: index.html (.home-page body), project.html
 * (.project-page body) and contact.html (.contact-page body). The
 * shell that loads is determined by Netlify's _redirects rules; this
 * module looks at the body class to decide which page module to call.
 *
 * Cross-shell navigation (e.g. clicking the logo on Project to return
 * Home) goes via window.location.assign in the page modules. The
 * vertical sweep animation between Home and a sub-page is driven by
 * the Cross-document View Transitions API (Phase 10) — see base.css.
 * Direction is picked there by :has(body.<page>-page) on the new
 * page, so no JS coordination is needed. Browsers without view-
 * transition support reload instantly — acceptable graceful fallback.
 *
 * The whole render path is synchronous: data is read from
 * window.__SITE_DATA__ (inlined by scripts/build.js), and the page
 * modules are statically imported so module evaluation completes
 * before first paint. This is required for the new page's view
 * transition snapshot to capture the rendered content, not an empty
 * shell.
 */

import { loadData } from './data.js';
import { getCurrentRoute, getCurrentSlug } from './router.js';
import { initHome } from './home.js';
import { initProject } from './project.js';
import { initContact } from './contact.js';
import { initCursor } from './cursor.js';

let homeInitialized = false;
let data = null;

function init() {
  try {
    data = loadData();
    applyRoute();
  } catch (err) {
    console.error('main: initialization failed', err);
    showError('Could not load site content. Try reloading the page.');
    return;
  }

  // Custom cursor (experimental). Self-disables on touch / coarse-
  // pointer devices and for reduced-motion users; no harm to call it
  // unconditionally.
  initCursor();

  window.addEventListener('popstate', applyRoute);
  window.addEventListener('route-change', applyRoute);
}

function applyRoute() {
  const route = getCurrentRoute();
  const slug = getCurrentSlug();
  const onHomeShell    = document.body.classList.contains('home-page');
  const onProjectShell = document.body.classList.contains('project-page');
  const onContactShell = document.body.classList.contains('contact-page');

  if (onHomeShell) {
    if (route === 'home') {
      if (!homeInitialized) {
        initHome(data);
        homeInitialized = true;
      }
      return;
    }
    // Home shell loaded but URL says project or contact — pushState changed
    // path without a reload. Fetch the correct shell.
    window.location.assign(window.location.pathname);
    return;
  }

  if (onProjectShell) {
    if (route === 'project') {
      initProject(data, slug);
      return;
    }
    window.location.assign(window.location.pathname);
    return;
  }

  if (onContactShell) {
    if (route === 'contact') {
      initContact(data);
      return;
    }
    window.location.assign(window.location.pathname);
  }
}

function showError(message) {
  // Best-effort error surface; pages that ship a placeholder element
  // (currently only the home shell, from earlier phases) get a visible
  // message, others log to the console.
  const placeholder = document.querySelector('[data-placeholder]');
  const placeholderMessage = document.querySelector('[data-placeholder-message]');
  if (placeholder && placeholderMessage) {
    placeholderMessage.textContent = message;
    placeholder.hidden = false;
  } else {
    console.error(message);
  }
}

init();
