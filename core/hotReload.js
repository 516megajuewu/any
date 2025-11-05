const path = require('path');
const { EventEmitter } = require('events');
const chokidar = require('chokidar');

const emitter = new EventEmitter();
let watcher;
let reloadInProgress = new Map(); // Track in-progress reloads to prevent loops
let moduleCache = new Map(); // Cache previous working versions for fallback

const RELOAD_DEBOUNCE = 100; // ms
const RELOAD_TIMEOUT = 5000; // ms
const reloadTimers = new Map();

function setupHotReload(options = {}) {
  if (watcher) {
    return emitter;
  }

  const watchDir = options.watchDir || path.join(__dirname);
  const patterns = options.patterns || ['**/*.js', '**/*.json'];
  const callbacks = options.callbacks || {};

  // Exclude hotReload.js itself and build artifacts
  const ignored = options.ignored || [
    '**/node_modules/**',
    '**/.git/**',
    '**/hotReload.js', // Exclude self
    '**/*.log',
    '**/logs/**',
    '**/data/**',
    '**/html/**',
    '**/frontend/**',
    '**/apps/**',
    '**/.DS_Store',
    '**/build/**',
    '**/dist/**',
    '**/*.map'
  ];

  watcher = chokidar.watch(patterns.map((pattern) => path.join(watchDir, pattern)), {
    ignoreInitial: true,
    ignored,
    awaitWriteFinish: {
      stabilityThreshold: 200,
      pollInterval: 100
    }
  });

  watcher.on('all', (eventName, filePath) => {
    // Debounce rapid successive changes
    if (reloadTimers.has(filePath)) {
      clearTimeout(reloadTimers.get(filePath));
    }

    const timer = setTimeout(() => {
      reloadTimers.delete(filePath);
      handleFileChange(eventName, filePath, watchDir, callbacks);
    }, RELOAD_DEBOUNCE);

    reloadTimers.set(filePath, timer);
  });

  watcher.on('error', (error) => {
    emitter.emit('error', {
      type: 'watcher-error',
      message: error.message,
      error
    });
  });

  return emitter;
}

async function handleFileChange(eventName, filePath, watchDir, callbacks) {
  const relativePath = path.relative(watchDir, filePath);
  const moduleId = getModuleId(filePath);

  // Check for reload loop
  if (reloadInProgress.has(moduleId)) {
    const startTime = reloadInProgress.get(moduleId);
    const elapsed = Date.now() - startTime;
    if (elapsed < RELOAD_TIMEOUT) {
      emitter.emit('error', {
        type: 'reload-loop',
        message: `Reload loop detected for ${relativePath}`,
        filePath,
        moduleId
      });
      return;
    }
  }

  reloadInProgress.set(moduleId, Date.now());

  try {
    // Cache the previous working version
    let previousModule = null;
    if (require.cache[moduleId]) {
      try {
        previousModule = { ...require.cache[moduleId] };
        moduleCache.set(moduleId, previousModule);
      } catch (error) {
        // Ignore cache errors
      }
    }

    // Bust the module cache
    const deletedModules = bustModuleCache(moduleId);

    // Attempt to reload the module
    let reloadedModule = null;
    let reloadError = null;

    try {
      reloadedModule = require(moduleId);
    } catch (error) {
      reloadError = error;

      // Restore previous module if available
      if (previousModule) {
        try {
          require.cache[moduleId] = previousModule;
        } catch (restoreError) {
          // Log but continue
        }
      }

      // Broadcast error event
      const errorInfo = {
        type: 'core:error',
        event: eventName,
        filePath,
        relativePath,
        moduleId,
        message: `Failed to reload ${relativePath}: ${error.message}`,
        error: {
          message: error.message,
          stack: error.stack,
          code: error.code
        },
        timestamp: Date.now()
      };

      emitter.emit('error', errorInfo);
      broadcastError(errorInfo);

      return;
    }

    // Execute callbacks for reinitialization
    try {
      if (callbacks.onReload && typeof callbacks.onReload === 'function') {
        await callbacks.onReload({
          moduleId,
          filePath,
          relativePath,
          module: reloadedModule,
          eventName
        });
      }

      // Call specific callbacks based on module type
      if (relativePath.includes('routes') && callbacks.onRouteReload) {
        await callbacks.onRouteReload({ moduleId, filePath, relativePath, module: reloadedModule });
      } else if (relativePath.includes('metrics') && callbacks.onMetricsReload) {
        await callbacks.onMetricsReload({ moduleId, filePath, relativePath, module: reloadedModule });
      } else if (relativePath.includes('processManager') && callbacks.onProcessManagerReload) {
        await callbacks.onProcessManagerReload({ moduleId, filePath, relativePath, module: reloadedModule });
      }
    } catch (callbackError) {
      // Log callback errors but don't fail the reload
      emitter.emit('error', {
        type: 'callback-error',
        message: `Callback error during reload of ${relativePath}: ${callbackError.message}`,
        filePath,
        moduleId,
        error: callbackError
      });
    }

    // Successful reload
    const reloadInfo = {
      type: 'core:reload',
      event: eventName,
      filePath,
      relativePath,
      moduleId,
      deletedModules: deletedModules.length,
      timestamp: Date.now()
    };

    emitter.emit('reload', reloadInfo);
    broadcastReload(reloadInfo);

  } catch (error) {
    // Unexpected error during reload process
    const errorInfo = {
      type: 'core:error',
      event: eventName,
      filePath,
      relativePath,
      moduleId,
      message: `Unexpected error during reload of ${relativePath}: ${error.message}`,
      error: {
        message: error.message,
        stack: error.stack
      },
      timestamp: Date.now()
    };

    emitter.emit('error', errorInfo);
    broadcastError(errorInfo);

  } finally {
    // Clear reload in progress after timeout
    setTimeout(() => {
      reloadInProgress.delete(moduleId);
    }, RELOAD_TIMEOUT);
  }
}

function getModuleId(filePath) {
  try {
    return require.resolve(filePath);
  } catch (error) {
    return path.resolve(filePath);
  }
}

function bustModuleCache(moduleId) {
  const deletedModules = [];

  // Delete the module and its children recursively
  function deleteModule(id) {
    const module = require.cache[id];
    if (!module) {
      return;
    }

    // Delete children first
    if (module.children) {
      for (const child of module.children) {
        if (child.id && require.cache[child.id]) {
          deleteModule(child.id);
        }
      }
    }

    // Delete the module itself
    delete require.cache[id];
    deletedModules.push(id);
  }

  deleteModule(moduleId);
  return deletedModules;
}

function broadcastReload(info) {
  // This will be called by index.js via the event emitter
  // We emit to the emitter so index.js can forward to wsHub
}

function broadcastError(info) {
  // This will be called by index.js via the event emitter
  // We emit to the emitter so index.js can forward to wsHub
}

async function close() {
  if (!watcher) {
    return;
  }

  // Clear all pending timers
  for (const timer of reloadTimers.values()) {
    clearTimeout(timer);
  }
  reloadTimers.clear();

  await watcher.close();
  watcher = null;
  reloadInProgress.clear();
  moduleCache.clear();
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
