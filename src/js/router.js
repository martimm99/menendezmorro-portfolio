/**
 * router.js — minimal URL routing for the SPA shell.
 *
 * Three exports:
 *   getCurrentRoute() — 'home' | 'project' | 'contact', derived from path.
 *   getCurrentSlug()  — slug for /<slug>, or null for home / contact.
 *   navigateTo(url)   — pushState + dispatch 'route-change' so main.js can
 *                       re-render. Browser back/forward still works (the
 *                       'popstate' listener in main.js handles those).
 *
 * All three routes (home / project / contact) render through dedicated
 * HTML shells served by Netlify via the _redirects rules. Each shell
 * loads main.js which dispatches to the matching page module based on
 * the body class.
 */

export function getCurrentRoute() {
  const path = window.location.pathname;
  if (path === '/' || path === '' || path === '/index.html') return 'home';
  if (path === '/contact' || path === '/contact/') return 'contact';
  return 'project';
}

export function getCurrentSlug() {
  if (getCurrentRoute() !== 'project') return null;
  return window.location.pathname.replace(/^\/+|\/+$/g, '');
}

export function navigateTo(url) {
  if (url === window.location.pathname) return;
  window.history.pushState(null, '', url);
  window.dispatchEvent(new CustomEvent('route-change', { detail: { url } }));
}
