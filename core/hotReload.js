const path = require('path');
const { EventEmitter } = require('events');
const chokidar = require('chokidar');

const emitter = new EventEmitter();
let watcher;

function setupHotReload(options = {}) {
  if (watcher) {
    return emitter;
  }

  const watchDir = options.watchDir || path.join(__dirname);
  const patterns = options.patterns || ['**/*.js', '**/*.json'];

  watcher = chokidar.watch(patterns.map((pattern) => path.join(watchDir, pattern)), {
    ignoreInitial: true,
    ignored: options.ignored || ['**/node_modules/**', '**/.git/**']
  });

  watcher.on('all', (eventName, filePath) => {
    try {
      const resolved = require.resolve(filePath);
      delete require.cache[resolved];
    } catch (error) {
      if (error.code !== 'MODULE_NOT_FOUND') {
        emitter.emit('error', error);
      }
    }

    emitter.emit('reload', {
      event: eventName,
      filePath
    });
  });

  watcher.on('error', (error) => {
    emitter.emit('error', error);
  });

  return emitter;
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
