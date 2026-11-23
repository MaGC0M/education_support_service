import http from 'node:http';
import https from 'node:https';
import { readFile } from 'node:fs/promises';

const port = Number(process.env.PORT || 5173);
const api = new URL(process.env.API_URL || 'http://127.0.0.1:8000');
const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
]);

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');

  if (url.pathname.startsWith('/api/')) {
    const target = new URL(api);
    target.pathname = url.pathname.slice(4);
    target.search = url.search;
    const transport = target.protocol === 'https:' ? https : http;
    const headers = { ...request.headers, host: target.host };
    delete headers.connection;
    const upstream = transport.request(target, {
      method: request.method,
      headers,
      timeout: 10000,
    }, (incoming) => {
      response.writeHead(incoming.statusCode, incoming.headers);
      incoming.pipe(response);
    });
    upstream.on('timeout', () => upstream.destroy(new Error('API timeout')));
    upstream.on('error', () => {
      if (response.headersSent) {
        response.destroy();
        return;
      }
      response.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ detail: 'API_UNAVAILABLE' }));
    });
    request.on('aborted', () => upstream.destroy());
    request.pipe(upstream);
    return;
  }

  if (url.pathname === '/favicon.ico') {
    response.writeHead(204);
    response.end();
    return;
  }

  const entry = files.get(url.pathname);
  if (!entry || !['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }
  try {
    const body = await readFile(new URL(entry[0], import.meta.url));
    response.writeHead(200, { 'Content-Type': entry[1], 'Cache-Control': 'no-store' });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch {
    response.writeHead(500);
    response.end('Unable to read frontend file');
  }
});

server.on('error', (error) => {
  console.error(error.code === 'EADDRINUSE'
    ? `Порт ${port} уже занят. Закройте предыдущий запуск или задайте PORT.`
    : error.message);
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => {
  console.log(`\n  Бюро — служба поддержки\n  http://127.0.0.1:${port}\n  API: ${api.origin}\n  Ctrl+C — остановить\n`);
});
process.on('SIGINT', () => server.close(() => process.exit(0)));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
