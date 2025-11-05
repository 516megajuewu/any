const path = require('path');
const { EventEmitter } = require('events');
const chokidar = require('chokidar');

const emitter = new EventEmitter();
let watcher;
let debounceTimer;
const pendingChanges = new Map();
const DEBOUNCE_DELAY = 300;

function setupHotReload(options = {}) {
  if (watcher) {
    return emitter;
  }

  const watchDir = options.watchDir || path.join(__dirname);
  const patterns = options.patterns || ['**/*.js', '**/*.json'];
  const debounceDelay = options.debounceDelay ?? DEBOUNCE_DELAY;

  watcher = chokidar.watch(patterns.map((pattern) => path.join(watchDir, pattern)), {
    ignoreInitial: true,
    ignored: options.ignored || ['**/node_modules/**', '**/.git/**']
  });

  watcher.on('all', (eventName, filePath) => {
    const relativePath = path.relative(watchDir, filePath);
    pendingChanges.set(filePath, { event: eventName, path: relativePath, timestamp: Date.now() });

    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(() => {
      processChanges(watchDir);
    }, debounceDelay);
  });

  watcher.on('error', (error) => {
    emitter.emit('error', error);
  });

  return emitter;
}

function processChanges(watchDir) {
  if (pendingChanges.size === 0) {
    return;
  }

  const changes = Array.from(pendingChanges.values());
  const reloadedModules = [];
  const failedModules = [];

  for (const [filePath, change] of pendingChanges.entries()) {
    try {
      const resolved = require.resolve(filePath);
      delete require.cache[resolved];
      reloadedModules.push(change.path);
    } catch (error) {
      if (error.code !== 'MODULE_NOT_FOUND') {
        failedModules.push({ path: change.path, error: error.message });
        emitter.emit('error', error);
      }
    }
  }

  pendingChanges.clear();

  const reloadEvent = {
    changedFiles: changes.map((c) => ({ path: c.path, event: c.event })),
    reloadedModules,
    failedModules,
    timestamp: Date.now(),
    summary: `Reloaded ${reloadedModules.length} module(s)${failedModules.length > 0 ? `, ${failedModules.length} failed` : ''}`
  };

  emitter.emit('reload', reloadEvent);
}

async function close() {
  if (!watcher) {
    return;
  }

  await watcher.close();
  watcher = null;
}

module.exports = {
  setupHotReload,
  onReload: (handler) => {
    emitter.on('reload', handler);
    return () => emitter.off('reload', handler);
  },
  onError: (handler) => {
    emitter.on('error', handler);
    return () => emitter.off('error', handler);
  },
  close
};
