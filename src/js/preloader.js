/**
 * preloader.js
 *
 * Three-phase intro on the home page:
 *
 *   Phase 1 — solid blue (#0055ff) shown immediately when JS runs.
 *   Phase 2 — white fill clipped to the MORRO logo shape sweeps IN
 *              left-to-right with an S-curve leading edge.
 *   Phase 3 — logo held for at least 1 s AND the first cover image loads,
 *              then preloader exits with a right-to-left sweep.
 *
 * The preloader element is created dynamically — it is never in the HTML —
 * so it cannot appear during cross-document view-transition captures on
 * return visits or any other timing edge cases.
 *
 * Revert: delete this file + preloader.css, and remove the import in main.js.
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
  // Only play once per session — skip on back-navigation and subsequent loads.
  try {
    if (sessionStorage.getItem('preloaderShown')) return;
    sessionStorage.setItem('preloaderShown', '1');
  } catch { return; }

  // Build and mount the preloader only when it should play, so it is never
  // present in the DOM during view-transition captures on return visits.
  const fill = document.createElement('div');
  fill.id = 'preloader-logo-fill';

  const clip = document.createElement('div');
  clip.id = 'preloader-logo-clip';
  clip.appendChild(fill);

  const stage = document.createElement('div');
  stage.id = 'preloader-stage';
  stage.appendChild(clip);

  const el = document.createElement('div');
  el.id = 'preloader';
  el.setAttribute('aria-hidden', 'true');
  el.appendChild(stage);

  document.body.prepend(el);

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

  el.remove();
}
