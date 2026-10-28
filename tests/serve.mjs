#!/usr/bin/env node
// Serveur de développement et de test : sert le dossier du projet sur http://localhost:8765
// (port : variable PORT). Sans dépendance. Rien n'est mis en cache par le navigateur : un
// rechargement prend toujours la dernière version des modules et du worker Whisper.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const PORT = Number(process.env.PORT) || 8765;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.md': 'text/markdown; charset=utf-8',
};

createServer(async (req, res) => {
  let path = normalize(join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
  if (!path.startsWith(ROOT + sep) && path !== ROOT) {
    res.writeHead(403).end();
    return;
  }
  try {
    if ((await stat(path)).isDirectory()) path = join(path, 'index.html');
    const body = await readFile(path);
    res.writeHead(200, { 'Content-Type': TYPES[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Introuvable');
  }
}).listen(PORT, '127.0.0.1', () => console.log(`DocMate : http://localhost:${PORT}/`));
