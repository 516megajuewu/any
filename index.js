const path = require('path');
const fs = require('fs');
const Fastify = require('fastify');
const cors = require('cors');
const { WebSocketServer, WebSocket } = require('ws');

const { setupHotReload, close: closeHotReload } = require('./core/hotReload');
const processManager = require('./core/processManager');
const metrics = require('./core/metrics');
const fileService = require('./core/fileService');
const packageManager = require('./core/packageManager');

const isDevMode = process.argv.includes('--dev') || process.env.NODE_ENV === 'development';
process.env.NODE_ENV = isDevMode ? 'development' : process.env.NODE_ENV || 'production';

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const HTML_DIRECTORY = path.join(__dirname, 'html');
const DATA_DIRECTORY = path.join(__dirname, 'data');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8'
};

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || (isDevMode ? 'debug' : 'info')
  }
});

const corsMiddleware = cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
});

fastify.addHook('onRequest', (request, reply, done) => {
  corsMiddleware(request.raw, reply.raw, (error) => {
    if (error) {
      done(error);
      return;
    }

    if (request.method === 'OPTIONS') {
      reply.code(204).send();
      return;
    }

    done();
  });
});

async function readJsonFile(fileName, fallback) {
  const target = path.join(DATA_DIRECTORY, fileName);
  try {
    const raw = await fs.promises.readFile(target, 'utf8');
    return JSON.parse(raw || 'null');
  } catch (error) {
    if (error.code === 'ENOENT' && fallback !== undefined) {
      return fallback;
    }
    throw error;
  }
}

async function sendStaticFile(request, reply, relativePath, { fallbackToIndex } = { fallbackToIndex: true }) {
  const normalized = relativePath ? path.normalize(relativePath) : '';
  const safePath = normalized.replace(/^([/\\]+|\.\.(?:[/\\]|$))+/, '');
  const resolvedPath = path.resolve(HTML_DIRECTORY, safePath);

  if (!resolvedPath.startsWith(HTML_DIRECTORY)) {
    reply.code(403).send('Forbidden');
    return;
  }

  const fallbackIndex = path.join(HTML_DIRECTORY, 'index.html');

  try {
    let filePath = resolvedPath;
    const stats = await fs.promises.stat(filePath);
    if (stats.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }

    const extension = path.extname(filePath).toLowerCase();
    const mimeType = MIME_TYPES[extension] || 'application/octet-stream';
    reply.type(mimeType);
    reply.send(fs.createReadStream(filePath));
  } catch (error) {
    if (error.code === 'ENOENT' && fallbackToIndex) {
      try {
        const fallbackStats = await fs.promises.stat(fallbackIndex);
        if (fallbackStats.isFile()) {
          reply.type(MIME_TYPES['.html']);
          reply.send(fs.createReadStream(fallbackIndex));
          return;
        }
      } catch (fallbackError) {
        if (fallbackError.code !== 'ENOENT') {
          request.log.error(fallbackError);
        }
      }
    }

    if (error.code === 'ENOENT') {
      if (!fallbackToIndex) {
        reply
          .type(MIME_TYPES['.html'])
          .send('<!DOCTYPE html><html><head><meta charset="utf-8"/><title>No frontend bundle</title></head><body style="font-family: system-ui, -apple-system, BlinkMacSystemFont, \'Segoe UI\', sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #0f172a; color: #f8fafc;"><div><h1>Frontend build missing</h1><p>The Vue frontend has not been built yet. Run <code>npm install</code> and <code>npm run build</code> inside the <code>frontend</code> directory.</p></div></body></html>');
        return;
      }
      reply.code(404).send('Not Found');
      return;
    }

    request.log.error(error);
    reply.code(500).send('Internal Server Error');
  }
}

fastify.get('/health', async () => ({
  status: 'ok',
  mode: process.env.NODE_ENV,
  timestamp: Date.now()
}));

fastify.get('/api/apps', async () => readJsonFile('apps.json', []));
fastify.get('/api/settings', async () => readJsonFile('settings.json', {
  ui: {},
  pkgManagers: { node: 'npm', python: 'pip' },
  pipIndex: null
}));

fastify.get('/api/files', async (request, reply) => {
  const targetPath = request.query?.path || '.';
  try {
    const items = await fileService.listDirectory(targetPath, { baseDir: process.cwd() });
    return { path: targetPath, items };
  } catch (error) {
    reply.code(400).send({ error: error.message });
  }
});

fastify.get('/api/processes', async () => ({ processes: processManager.listProcesses() }));

fastify.get('/api/metrics/:pid', async (request, reply) => {
  const pid = Number(request.params.pid);
  if (Number.isNaN(pid)) {
    reply.code(400).send({ error: 'pid must be a number' });
    return;
  }

  const result = await metrics.getProcessMetrics(pid);
  if (!result) {
    reply.code(404).send({ error: 'metrics unavailable' });
    return;
  }

  return result;
});

fastify.get('/api/package-managers/defaults', async () => packageManager.getPackageManagerDefaults());

fastify.get('/', (request, reply) => sendStaticFile(request, reply, 'index.html', { fallbackToIndex: false }));
fastify.get('/*', (request, reply) => {
  const relative = request.params['*'] || request.url.slice(1);
  return sendStaticFile(request, reply, relative, { fallbackToIndex: true });
});

const webSocketServer = new WebSocketServer({ noServer: true });
const sockets = new Set();

function broadcast(payload) {
  const data = JSON.stringify(payload);
  for (const socket of sockets) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(data);
    }
  }
}

webSocketServer.on('connection', (socket) => {
  sockets.add(socket);
  socket.send(JSON.stringify({ type: 'connection', message: 'connected', mode: process.env.NODE_ENV }));

  socket.on('close', () => {
    sockets.delete(socket);
  });
});

fastify.server.on('upgrade', (request, socket, head) => {
  if (request.url !== '/ws') {
    socket.destroy();
    return;
  }

  webSocketServer.handleUpgrade(request, socket, head, (ws) => {
    webSocketServer.emit('connection', ws, request);
  });
});

let hotReloadEmitter;
if (isDevMode) {
  hotReloadEmitter = setupHotReload({ watchDir: path.join(__dirname, 'core') });
  hotReloadEmitter.on('reload', (event) => {
    broadcast({ type: 'core:reload', payload: event });
  });
  hotReloadEmitter.on('error', (error) => {
    fastify.log.error({ err: error }, 'Hot reload watcher error');
  });
}

fastify.addHook('onClose', async () => {
  if (hotReloadEmitter) {
    await closeHotReload();
  }
  for (const socket of sockets) {
    socket.close();
  }
});

async function start() {
  try {
    await fastify.listen({ port: PORT, host: HOST });
    fastify.log.info(`Server listening on http://${HOST}:${PORT}`);
    broadcast({ type: 'status', message: 'backend-started', port: PORT });
  } catch (error) {
    fastify.log.error(error);
    process.exit(1);
  }
}

function handleShutdown(signal) {
  fastify.log.info(`Received ${signal}. Closing server.`);
  fastify.close().finally(() => {
    process.exit(0);
  });
}

['SIGINT', 'SIGTERM'].forEach((signal) => {
  process.on(signal, () => handleShutdown(signal));
});

start();

module.exports = {
  fastify,
  broadcast,
  processManager,
  metrics,
  fileService,
  packageManager
};
