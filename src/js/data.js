/**
 * data.js — loads content/projects.json and content/site.json.
 *
 * Returns a stable object shaped as { projects, site } so consumers can
 * destructure once at startup. The fetch is cached for the lifetime of the
 * page (the data is shipped statically, no need to refetch).
 */

let cache = null;

export function loadData() {
  if (cache) return cache;
  cache = Promise.all([
    fetch('/content/projects.json').then(assertOk).then((r) => r.json()),
    fetch('/content/site.json').then(assertOk).then((r) => r.json())
  ]).then(([projectsDoc, site]) => ({
    projects: projectsDoc.projects,
    site
  }));
  return cache;
}

function assertOk(response) {
  if (!response.ok) {
    throw new Error(`data: fetch failed for ${response.url} — ${response.status}`);
  }
  return response;
}
