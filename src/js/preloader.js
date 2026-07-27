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
 * The S-curve reveal is driven by requestAnimationFrame (not a CSS transition
 * or @keyframes) because Chrome/Blink misrenders clip-path: path() animation
 * via the CSS pipeline on desktop. Setting clip-path inline each frame
 * bypasses the bug while keeping the exact same paths and easing.
 *
 * Revert: delete this file + preloader.css, remove the import in main.js,
 * remove the inline <script> and <link rel="stylesheet"> for preloader from
 * index.html, and remove the <link rel="preload"> for morro-logo.svg.
 */

// Builds an easing function from CSS cubic-bezier control points using a
// lookup table — accurate enough for 60fps animation, no Newton iteration needed.
function cubicBezier(x1, y1, x2, y2) {
  const N = 100;
  const xs = new Float64Array(N + 1);
  const ys = new Float64Array(N + 1);
  for (let i = 0; i <= N; i++) {
    const t = i / N, u = 1 - t;
    xs[i] = 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t;
    ys[i] = 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t;
  }
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let lo = 0, hi = N;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] <= x) lo = m; else hi = m; }
    return ys[lo] + ((x - xs[lo]) / (xs[hi] - xs[lo])) * (ys[hi] - ys[lo]);
  };
}

// Animates clip-path: path() frame-by-frame via rAF, interpolating each
// numeric coordinate independently. Returns a Promise that resolves on completion.
function animatePath(el, from, to, duration, ease) {
  return new Promise((resolve) => {
    const a = from.match(/-?[\d.]+/g).map(Number);
    const b = to.match(/-?[\d.]+/g).map(Number);
    let t0 = null;
    function tick(now) {
      if (!t0) t0 = now;
      const progress = ease(Math.min((now - t0) / duration, 1));
      let i = 0;
      el.style.clipPath = 'path("' + from.replace(/-?[\d.]+/g, () => {
        const v = a[i] + (b[i] - a[i]) * progress;
        i++;
        return +v.toFixed(2);
      }) + '")';
      if (progress < 1) requestAnimationFrame(tick); else resolve();
    }
    requestAnimationFrame(tick);
  });
}

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

const PATHS = {
  desktop: {
    from: 'M -200 -10 C -350 40 -50 130 -200 170 L -5000 170 L -5000 -10 Z',
    to:   'M 640 -10 C 490 40 790 130 640 170 L -5000 170 L -5000 -10 Z',
  },
  mobile: {
    from: 'M -120 -10 C -220 35 -20 80 -120 125 L -5000 125 L -5000 -10 Z',
    to:   'M 430 -10 C 330 35 530 80 430 125 L -5000 125 L -5000 -10 Z',
  },
};

const easeReveal = cubicBezier(0.37, 0, 0.63, 1);

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

  // Phase 2: hold for minimum 500ms, then sweep the logo in via rAF animation.
  await new Promise((r) => setTimeout(r, 500));
  const isMobile = window.matchMedia('(max-width: 768px)').matches;
  const { from, to } = isMobile ? PATHS.mobile : PATHS.desktop;
  await animatePath(clip, from, to, 2000, easeReveal);

  // Phase 3: hold for minimum 1 s after fill completes; also wait for cover.
  await Promise.all([coverReady, new Promise((r) => setTimeout(r, 1000))]);

  // Preloader exits right-to-left.
  el.classList.add('is-exiting');
  await afterTransition(el);

  clearTimeout(safety);
  el.remove();
}
