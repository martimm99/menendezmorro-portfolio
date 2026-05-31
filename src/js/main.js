/**
 * main.js — entry point loaded by every HTML shell.
 *
 * Two shells exist: index.html (.home-page body) and project.html
 * (.project-page body). Phase 9 will add contact.html. The shell that
 * loads is determined by Netlify's _redirects rules; this module looks
 * at the body class to decide which page module to call.
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

const PLACEHOLDER_MESSAGES = {
  contact: 'Contact page coming in Phase 9'
};

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
  const onHomeShell = document.body.classList.contains('home-page');
  const onProjectShell = document.body.classList.contains('project-page');

  if (onHomeShell) {
    if (route === 'home') {
      hidePlaceholder();
      if (!homeInitialized) {
        initHome(data);
        homeInitialized = true;
      }
      return;
    }
    if (route === 'contact') {
      showPlaceholder('contact');
      return;
    }
    // Home shell loaded but URL says project — only happens via pushState
    // shenanigans. Reload to fetch the correct shell.
    if (route === 'project') {
      window.location.assign(window.location.pathname);
      return;
    }
  }

  if (onProjectShell) {
    if (route === 'project') {
      const { initProject } = await import('./project.js');
      initProject(data, slug);
      return;
    }
    // Project shell loaded but URL says home or contact — pushState changed
    // path without a full reload. Reload to fetch the correct shell.
    window.location.assign(window.location.pathname);
  }
}

function showPlaceholder(route) {
  const placeholder = document.querySelector('[data-placeholder]');
  const message = document.querySelector('[data-placeholder-message]');
  if (!placeholder || !message) {
    console.warn(`main: route "${route}" needs the placeholder elements that only the home shell ships.`);
    return;
  }
  message.textContent = PLACEHOLDER_MESSAGES[route] || 'Page not available yet';
  placeholder.hidden = false;
}

function hidePlaceholder() {
  const placeholder = document.querySelector('[data-placeholder]');
  if (placeholder) placeholder.hidden = true;
}

function showError(message) {
  const placeholder = document.querySelector('[data-placeholder]');
  const placeholderMessage = document.querySelector('[data-placeholder-message]');
  if (placeholder && placeholderMessage) {
    placeholderMessage.textContent = message;
    placeholder.hidden = false;
  }
}

init();
