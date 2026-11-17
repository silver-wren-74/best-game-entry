// Neon Void — local development server (Node 22, standard library only).
//
// Serves the game/ folder so the game can be played in a desktop browser with no build
// step and no network beyond localhost:
//   node serve.ts              -> http://localhost:8080
//   node serve.ts --port 9000  -> http://localhost:9000
// Paths are resolved inside game/ only; anything that tries to climb out is refused.

import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const gameRoot = resolve(fileURLToPath(new URL('./game', import.meta.url)));

const argv = process.argv.slice(2);
const portFlagAt = argv.indexOf('--port');
const wantedPort = portFlagAt === -1 ? 8080 : Number(argv[portFlagAt + 1]);
const port =
  Number.isInteger(wantedPort) && wantedPort > 0 && wantedPort < 65536 ? wantedPort : 8080;

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
};

const server = createServer((request, response) => {
  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
  } catch {
    response.writeHead(400).end('bad request');
    return;
  }
  if (pathname.endsWith('/')) pathname += 'index.html';

  const filePath = resolve(join(gameRoot, normalize(pathname)));
  if (filePath !== gameRoot && !filePath.startsWith(gameRoot + sep)) {
    response.writeHead(403).end('forbidden');
    return;
  }

  let length: number;
  try {
    const info = statSync(filePath);
    if (!info.isFile()) throw new Error('directory');
    length = info.size;
  } catch {
    response.writeHead(404).end('not found');
    return;
  }

  response.writeHead(200, {
    'content-type': CONTENT_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
    'content-length': length,
    'cache-control': 'no-store',
  });
  createReadStream(filePath).pipe(response);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Neon Void is playable at http://localhost:${port}`);
});
