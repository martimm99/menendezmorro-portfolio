/**
 * main.js — entry point loaded by every HTML shell.
 *
 * Three shells exist: index.html (.home-page body), project.html
 * (.project-page body) and contact.html (.contact-page body). The
 * shell that loads is determined by Netlify's _redirects rules; this
 * module looks at the body class to decide which page module to call.
 *
 * Cross-shell navigation (e.g. clicking the logo on Project to return
 * Home) goes via window.location.assign in the page modules. That keeps
 * main.js simple: it never has to load one shell from inside another.
 * Phase 10 will replace these full reloads with proper vertical sweep
 * transitions.
 */

import { loadData } from './data.js';
import { getCurrentRoute, getCurrentSlug } from './router.js';
import { initHome } from './home.js';

let dataReady = null;
let homeInitialized = false;

async function init() {
  try {
    dataReady = loadData();
    const data = await dataReady;
    applyRoute(data);
  } catch (err) {
    console.error('main: initialization failed', err);
    showError('Could not load site content. Try reloading the page.');
    return;
  }

  window.addEventListener('popstate', handleRouteChange);
  window.addEventListener('route-change', handleRouteChange);
}

async function handleRouteChange() {
  try {
    const data = await dataReady;
    applyRoute(data);
  } catch (err) {
    console.error('main: route change failed', err);
  }
}

async function applyRoute(data) {
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
      const { initProject } = await import('./project.js');
      initProject(data, slug);
      return;
    }
    window.location.assign(window.location.pathname);
    return;
  }

  if (onContactShell) {
    if (route === 'contact') {
      const { initContact } = await import('./contact.js');
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
