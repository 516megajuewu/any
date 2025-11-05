const path = require('path');
const fs = require('fs');
const Fastify = require('fastify');
const cors = require('cors');

const { setupHotReload, close: closeHotReload } = require('./core/hotReload');
const registry = require('./core/registry');
const processManager = require('./core/processManager');
const metrics = require('./core/metrics');
const logBus = require('./core/logBus');
const wsHub = require('./core/wsHub');
const fileService = require('./core/fileService');
const packageManager = require('./core/packageManager');
const consoleManager = require('./core/consoleManager');

const appsRoutes = require('./core/routes/apps');
const logsRoutes = require('./core/routes/logs');
const metricsRoutes = require('./core/routes/metrics');
const filesRoutes = require('./core/routes/files');
const consoleRoutes = require('./core/routes/console');

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

fastify.get('/api/settings', async () => readJsonFile('settings.json', {
  ui: {},
  pkgManagers: { node: 'npm', python: 'pip' },
  pipIndex: null
}));

fastify.get('/api/package-managers/defaults', async () => packageManager.getPackageManagerDefaults());

appsRoutes(fastify);
logsRoutes(fastify);
metricsRoutes(fastify);
filesRoutes(fastify);
consoleRoutes(fastify);

async function snapshotApps() {
  return serializeApps(registry.list());
}

fastify.get('/', (request, reply) => sendStaticFile(request, reply, 'index.html', { fallbackToIndex: false }));
fastify.get('/*', (request, reply) => {
  const relative = request.params['*'] || request.url.slice(1);
  return sendStaticFile(request, reply, relative, { fallbackToIndex: true });
});

wsHub.init({ server: fastify.server });
consoleManager.init();

let hotReloadEmitter;
if (isDevMode) {
  hotReloadEmitter = setupHotReload({ watchDir: path.join(__dirname, 'core') });
  hotReloadEmitter.on('reload', (event) => {
    wsHub.publishCoreReload(event);
  });
  hotReloadEmitter.on('error', (error) => {
    fastify.log.error({ err: error }, 'Hot reload watcher error');
  });
}

processManager.events.on('status', (data) => {
  wsHub.publishStatus(data.id, data);

  if (data.status === 'running') {
    metrics.track(data.id, data.pid);
  } else if (data.status === 'stopped' || data.status === 'error') {
    metrics.track(data.id, null);
  }

  registry.updateStatus(data.id, data.status, {
    pid: data.pid,
    startTime: data.startTime,
    stopTime: data.stopTime,
    exitCode: data.exitCode,
    signal: data.signal,
    error: data.error
  });

  snapshotApps()
    .then((apps) => wsHub.publishList(apps))
    .catch((error) => fastify.log.error({ err: error }, 'Failed to publish app list'));
});

logBus.events.on('log', (entry) => {
  wsHub.publishLog(entry.appId, entry);
});

logBus.events.on('reset', ({ appId }) => {
  wsHub.publishLog(appId, { reset: true });
});

metrics.events.on('metrics', (snapshot) => {
  wsHub.publishMetrics(snapshot.appId, snapshot);
  registry.updateMetrics(snapshot.appId, snapshot);
});

processManager.events.on('stop', ({ id }) => {
  consoleManager.destroyAllSessionsForApp(id, 'app-stopped');
});

processManager.events.on('exit', ({ id }) => {
  consoleManager.destroyAllSessionsForApp(id, 'app-exited');
});

consoleManager.events.on('data', ({ sessionId, appId, data }) => {
  wsHub.broadcastToChannel(`console:${sessionId}`, {
    type: 'console:data',
    sessionId,
    appId,
    data,
    timestamp: Date.now()
  });
});

consoleManager.events.on('terminated', ({ sessionId, appId, reason, exitCode, signal }) => {
  wsHub.broadcastToChannel(`console:${sessionId}`, {
    type: 'console:terminated',
    sessionId,
    appId,
    reason,
    exitCode,
    signal,
    timestamp: Date.now()
  });
});

consoleManager.events.on('created', ({ sessionId, appId, shell, cols, rows, created }) => {
  wsHub.broadcast({
    type: 'console:created',
    sessionId,
    appId,
    shell,
    cols,
    rows,
    created,
    timestamp: Date.now()
  });
});

consoleManager.events.on('resized', ({ sessionId, appId, cols, rows }) => {
  wsHub.broadcastToChannel(`console:${sessionId}`, {
    type: 'console:resized',
    sessionId,
    appId,
    cols,
    rows,
    timestamp: Date.now()
  });
});

wsHub.events.on('message', ({ socket, message }) => {
  const { type, sessionId, data, cols, rows } = message;

  if (type === 'console:input') {
    if (!sessionId || typeof data !== 'string') {
      wsHub.send(socket, { type: 'error', error: 'Invalid console:input message' });
      return;
    }

    try {
      consoleManager.writeInput(sessionId, data);
    } catch (error) {
      wsHub.send(socket, {
        type: 'error',
        error: error.message,
        sessionId,
        timestamp: Date.now()
      });
    }
    return;
  }

  if (type === 'console:resize') {
    if (!sessionId || typeof cols !== 'number' || typeof rows !== 'number') {
      wsHub.send(socket, { type: 'error', error: 'Invalid console:resize message' });
      return;
    }

    try {
      consoleManager.resize(sessionId, cols, rows);
    } catch (error) {
      wsHub.send(socket, {
        type: 'error',
        error: error.message,
        sessionId,
        timestamp: Date.now()
      });
    }
    return;
  }
});

fastify.addHook('onClose', async () => {
  if (hotReloadEmitter) {
    await closeHotReload();
  }
  await processManager.stopAll();
  metrics.clearAll();
  consoleManager.shutdown();
  wsHub.shutdown();
});

async function start() {
  try {
    await registry.load();
    fastify.log.info('Registry loaded');

    await fastify.listen({ port: PORT, host: HOST });
    fastify.log.info(`Server listening on http://${HOST}:${PORT}`);

    wsHub.broadcast({ type: 'status', message: 'backend-started', port: PORT });
    const apps = await snapshotApps();
    wsHub.publishList(apps);
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
  registry,
  processManager,
  metrics,
  logBus,
  wsHub,
  fileService,
  packageManager,
  consoleManager
};
