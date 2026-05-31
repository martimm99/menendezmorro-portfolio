/**
 * preview.js
 *
 * Static HTTP server for the local `public/` directory. Run by `npm run
 * preview`, which builds first. SPA fallback (paths without an extension
 * that don't match a file are rewritten to /index.html) mirrors the
 * Netlify `_redirects` rule, so direct URL access to /<slug> or /contact
 * works locally exactly like it will in production.
 *
 * The server prints its URL once and stays alive until Ctrl+C.
 */

import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { resolve, dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = join(projectRoot, 'public');
const PORT = Number(process.env.PORT) || 8080;

const MIME = {
  '.html':  'text/html; charset=utf-8',
  '.css':   'text/css; charset=utf-8',
  '.js':    'application/javascript; charset=utf-8',
  '.mjs':   'application/javascript; charset=utf-8',
  '.json':  'application/json; charset=utf-8',
  '.txt':   'text/plain; charset=utf-8',
  '.xml':   'application/xml; charset=utf-8',
  '.svg':   'image/svg+xml',
  '.png':   'image/png',
  '.jpg':   'image/jpeg',
  '.jpeg':  'image/jpeg',
  '.webp':  'image/webp',
  '.gif':   'image/gif',
  '.mp4':   'video/mp4',
  '.webm':  'video/webm',
  '.woff':  'font/woff',
  '.woff2': 'font/woff2'
};

function resolveRequestPath(urlPath) {
  // Normalize and prevent escaping ROOT via "../".
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const safe = normalize(decoded).replace(/^(\.\.[\/\\])+/, '');
  let filePath = join(ROOT, safe);
  if (!filePath.startsWith(ROOT)) filePath = ROOT;

  if (filePath === ROOT || filePath.endsWith('/')) {
    filePath = join(filePath, 'index.html');
  }

  if (existsSync(filePath) && statSync(filePath).isFile()) {
    return filePath;
  }

  // Template fallback — mirrors public/_redirects so local preview matches
  // Netlify production. Extensionless paths that don't map to a real file
  // resolve to index.html for /contact (until Phase 9), or to project.html
  // for any other slug.
  if (!extname(safe)) {
    if (safe === '/contact' || safe === '/contact/') {
      const home = join(ROOT, 'index.html');
      if (existsSync(home)) return home;
    }
    const project = join(ROOT, 'project.html');
    if (existsSync(project)) return project;
    const home = join(ROOT, 'index.html');
    if (existsSync(home)) return home;
  }
  return null;
}

const server = createServer((req, res) => {
  const filePath = resolveRequestPath(req.url || '/');
  if (!filePath) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }
  const type = MIME[extname(filePath).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  createReadStream(filePath).pipe(res);
});

server.listen(PORT, () => {
  console.log(`preview: serving ${ROOT} at http://localhost:${PORT}`);
  console.log('         press Ctrl+C to stop.');
});
