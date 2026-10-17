/** Serves the production push worker beside Metro for isolated emulator browser QA. */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
if (process.env.MUSE_WEB_QA !== 'demo-muse') throw new Error('Set MUSE_WEB_QA=demo-muse and run Metro against isolated emulators first.');
const worker = path.resolve(__dirname, '../apps/web/site/paire-push-sw.js');
http.createServer((request, response) => {
  if (request.url.split('?')[0] === '/paire-push-sw.js') {
    response.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-cache' });
    response.end(fs.readFileSync(worker));
    return;
  }
  const requestPath = request.url.startsWith('/app/') ? request.url.replace(/^\/app\//, '/') : request.url;
  const upstream = http.request({ hostname: 'localhost', port: 8081, path: requestPath, method: request.method, headers: { ...request.headers, host: 'localhost:8081' } }, (reply) => {
    response.writeHead(reply.statusCode, reply.headers);
    reply.pipe(response);
  });
  upstream.on('error', () => { response.writeHead(502); response.end('Start emulator-configured Metro on localhost:8081.'); });
  request.pipe(upstream);
}).listen(8082, '127.0.0.1', () => process.stdout.write('Emulator browser QA: http://localhost:8082/app/\n'));
