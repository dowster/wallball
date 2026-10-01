import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

// Lightweight solo/local server. Use npm run dev for the real multiplayer runtime.
const root = resolve('web-dist');
const port = Number(process.env.PORT || 5173);
const contentTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
};

const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    const filePath = resolve(root, '.' + decodeURIComponent(pathname));
    // Decoding can reveal ../ traversal. Never serve files outside the build.
    if (filePath !== root && !filePath.startsWith(root + sep)) {
      response.writeHead(403).end();
      return;
    }
    const file = filePath === root ? resolve(root, 'index.html') : filePath;
    const data = await readFile(file);
    response
      .writeHead(200, {
        'Content-Type': contentTypes[extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      })
      .end(data);
  } catch {
    response.writeHead(404).end('Not found');
  }
});
server.listen(port, '0.0.0.0', () => console.log(`WallBall development server on port ${port}`));
