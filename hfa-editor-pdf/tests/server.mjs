// Servidor estático mínimo para os testes
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.pfb': 'application/octet-stream', '.bcmap': 'application/octet-stream', '.pdf': 'application/pdf', '.jpg': 'image/jpeg' };
export function serve(root, port = 0) {
  const srv = createServer(async (req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = normalize(join(root, p));
    if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
    try { const b = await readFile(file); res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' }); res.end(b); }
    catch { res.writeHead(404); res.end('404'); }
  });
  return new Promise((r) => srv.listen(port, '127.0.0.1', () => r({ srv, url: `http://127.0.0.1:${srv.address().port}/` })));
}
