/**
 * preloader.js
 *
 * Three-phase intro on the home page:
 *
 *   Phase 1 — solid blue (#0055ff) shown on the very first paint. The outer
 *              #preloader div is created by an inline <script> in index.html
 *              so it exists before any pixel is rendered. This function adopts
 *              that element and adds the animation children.
 *   Phase 2 — white fill clipped to the MORRO logo shape sweeps IN
 *              left-to-right with an S-curve leading edge.
 *   Phase 3 — logo held for at least 1 s AND the first cover image loads,
 *              then preloader exits with a right-to-left sweep.
 *
 * On return visits the inline script is skipped (sessionStorage flag), so
 * #preloader is never in the DOM during view-transition captures.
 *
 * Revert: delete this file + preloader.css, remove the import in main.js,
 * remove the inline <script> and <link rel="stylesheet"> for preloader from
 * index.html, and remove the <link rel="preload"> for morro-logo.svg.
 */

function afterTransition(el, property = 'clip-path', maxWait = 1200) {
  return new Promise((resolve) => {
    const fallback = setTimeout(resolve, maxWait);
    el.addEventListener('transitionend', function handler(e) {
      if (e.propertyName === property) {
        clearTimeout(fallback);
        el.removeEventListener('transitionend', handler);
        resolve();
      }
    });
  });
}

function waitForImage(src) {
  return new Promise((resolve) => {
    if (!src) { resolve(); return; }
    const img = new Image();
    img.onload = resolve;
    img.onerror = resolve;
    img.src = src.startsWith('/') ? src : '/' + src;
  });
}

function getActiveProject() {
  const data = window.__SITE_DATA__;
  if (!data?.projects?.length) return null;
  let slug;
  try { slug = sessionStorage.getItem('lastProjectSlug'); } catch { /* ok */ }
  return (slug && data.projects.find((p) => p.slug === slug)) || data.projects[0] || null;
}

function getCoverSrc(project) {
  if (!project) return null;
  return project.cover || project.media?.[0]?.src || null;
}

export async function initPreloader() {
  // The inline script created #preloader only on first visit. If it's absent,
  // this is a return visit (or sessionStorage was unavailable) — nothing to do.
  const el = document.getElementById('preloader');
  if (!el) return;

  // Set the session flag so subsequent navigations skip the preloader.
  try {
    sessionStorage.setItem('preloaderShown', '1');
  } catch {
    el.remove();
    return;
  }

  // Safety net: if the animation never completes (e.g. a JS error downstream),
  // remove the preloader after 8 s so the page is never permanently blocked.
  const safety = setTimeout(() => el.remove(), 8000);

  // Add animation children to the already-visible #preloader.
  const fill = document.createElement('div');
  fill.id = 'preloader-logo-fill';

  const clip = document.createElement('div');
  clip.id = 'preloader-logo-clip';
  clip.appendChild(fill);

  const stage = document.createElement('div');
  stage.id = 'preloader-stage';
  stage.appendChild(clip);

  el.appendChild(stage);

  // Start fetching the cover now so it is likely cached when we need it later.
  // The SVG mask is preloaded via <link rel="preload"> in the HTML, so it is
  // guaranteed cached well before the 500ms delay elapses.
  const coverReady = waitForImage(getCoverSrc(getActiveProject()));

  // Phase 2: hold for minimum 500ms, then sweep the logo in.
  await new Promise((r) => setTimeout(r, 500));
  clip.classList.add('is-in');
  await afterTransition(clip, 'clip-path', 2500);

  // Phase 3: hold for minimum 1 s after fill completes; also wait for cover.
  await Promise.all([coverReady, new Promise((r) => setTimeout(r, 1000))]);

  // Preloader exits right-to-left.
  el.classList.add('is-exiting');
  await afterTransition(el);

  clearTimeout(safety);
  el.remove();
}
