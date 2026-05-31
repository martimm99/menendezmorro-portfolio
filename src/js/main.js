/**
 * main.js — entry point loaded by every page in the SPA shell.
 *
 * Reads the current URL, loads data, and hands off to the page module.
 * Phase 5 fully implements Home; Project and Contact routes show a
 * placeholder until Phase 6 and Phase 9 land.
 *
 * Route changes (pushState via router.navigateTo or user-triggered
 * back/forward) trigger handleRouteChange, which re-evaluates and toggles
 * the appropriate UI.
 */

import { loadData } from './data.js';
import { getCurrentRoute, getCurrentSlug } from './router.js';
import { initHome } from './home.js';

let dataReady = null;
let homeInitialized = false;

const PLACEHOLDER_MESSAGES = {
  project: 'Project page coming in Phase 6',
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

function applyRoute(data) {
  const route = getCurrentRoute();
  const placeholder = document.querySelector('[data-placeholder]');
  const placeholderMessage = document.querySelector('[data-placeholder-message]');

  if (route === 'home') {
    if (placeholder) placeholder.hidden = true;
    if (!homeInitialized) {
      initHome(data);
      homeInitialized = true;
    }
    return;
  }

  if (placeholder && placeholderMessage) {
    const slug = getCurrentSlug();
    const message = PLACEHOLDER_MESSAGES[route] || 'Page not available yet';
    placeholderMessage.textContent = slug
      ? `${message} (${slug})`
      : message;
    placeholder.hidden = false;
  } else {
    console.warn(`main: route "${route}" not yet implemented and no placeholder element found.`);
  }
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
