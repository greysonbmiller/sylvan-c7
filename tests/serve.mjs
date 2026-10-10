// Static file server for the Playwright suite, serving the repo exactly as GitHub Pages does:
// under the /sylvan-c7 prefix, with a 301 to the trailing-slash form for directory requests so
// relative links resolve. Adapted from SquareWordCalligraphy/scripts/serve.mjs.
//
// Env (all optional):
//   ROOT=<dir>         directory to serve (default: repo root, one level above tests/)
//   PREFIX=/some/path  URL prefix the site lives under (default /sylvan-c7); anything outside it is 404
//   PORT=<n>           port (default 4180)
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(process.env.ROOT || fileURLToPath(new URL('..', import.meta.url)));
const PREFIX = (process.env.PREFIX ?? '/sylvan-c7').replace(/\/+$/, '');
if (PREFIX && !PREFIX.startsWith('/')) throw new Error(`PREFIX must start with "/": ${PREFIX}`);
const PORT = Number(process.env.PORT || 4180);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

const fail = (code) => Object.assign(new Error(String(code)), { code });

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    let path = decodeURIComponent(url.pathname);
    if (PREFIX) {
      if (path === PREFIX) path = PREFIX + '/'; // handled by the directory redirect below
      else if (!path.startsWith(PREFIX + '/')) throw fail(404);
      path = path.slice(PREFIX.length);
    }
    let file = normalize(join(ROOT, path));
    if (file !== ROOT && !file.startsWith(ROOT.endsWith(sep) ? ROOT : ROOT + sep)) throw fail(403);
    if ((await stat(file)).isDirectory()) {
      if (PREFIX && !url.pathname.endsWith('/')) {
        res.writeHead(301, { location: url.pathname + '/' + url.search });
        res.end();
        return;
      }
      file = join(file, 'index.html');
    }
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch (e) {
    res.writeHead(e.code === 403 ? 403 : 404, { 'content-type': 'text/plain' });
    res.end(e.code === 403 ? 'forbidden' : 'not found');
  }
}).listen(PORT, '127.0.0.1', () => console.log(`sylvan-c7 test server on http://127.0.0.1:${PORT}${PREFIX}/ (root ${ROOT})`));
