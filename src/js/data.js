/**
 * data.js — synchronous read of the site data inlined into the HTML
 * shell at build time.
 *
 * The build script (scripts/build.js, see buildSiteDataScript) emits
 * a <script>window.__SITE_DATA__ = {...}</script> tag in the <head>
 * of every HTML file, immediately before the deferred main.js module.
 * That inline script runs synchronously during HTML parsing, so by
 * the time main.js executes, __SITE_DATA__ is already set.
 *
 * Reading the data synchronously matters for cross-document view
 * transitions (Phase 10): the snapshot of the destination page is
 * taken at first paint, which happens after deferred modules finish
 * executing but before any await yields to the event loop. If we
 * fetched data asynchronously the snapshot would capture an empty
 * <body> and the vertical sweep would look like a featureless panel
 * appearing and vanishing.
 */

export function loadData() {
  const data = globalThis.__SITE_DATA__;
  if (!data || typeof data !== 'object') {
    throw new Error('data: window.__SITE_DATA__ is missing — was the page built with scripts/build.js?');
  }
  return data;
}
