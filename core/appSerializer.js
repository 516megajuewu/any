const path = require('path');
const fs = require('fs/promises');
const fg = require('fast-glob');

const processManager = require('./processManager');
const metrics = require('./metrics');

const repoRoot = path.resolve(path.join(__dirname, '..'));
const FILE_COUNT_IGNORE = ['node_modules/**', '.git/**', 'dist/**', 'build/**', 'logs/**', 'tmp/**'];
const FILE_COUNT_CACHE_TTL = 30_000;

const filesCountCache = new Map();

async function computeFilesCount(app) {
  const cwd = app?.cwd;
  if (!cwd) {
    return null;
  }

  const resolved = path.resolve(cwd);

  try {
    const stats = await fs.stat(resolved);
    if (!stats.isDirectory()) {
      return null;
    }
  } catch (error) {
    return null;
  }

  if (!resolved.startsWith(repoRoot)) {
    return null;
  }

  const cacheKey = `${app.id}:${resolved}`;
  const cached = filesCountCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < FILE_COUNT_CACHE_TTL) {
    return cached.count;
  }

  try {
    const entries = await fg(['**/*'], {
      cwd: resolved,
      onlyFiles: true,
      dot: false,
      ignore: FILE_COUNT_IGNORE,
      followSymbolicLinks: false
    });
    const count = entries.length;
    filesCountCache.set(cacheKey, { count, timestamp: Date.now() });
    return count;
  } catch (error) {
    return null;
  }
}

async function serializeApp(app) {
  const status = processManager.getStatus(app.id) || {};
  const metricsSnapshot = metrics.getSnapshot(app.id) || null;
  const filesCount = await computeFilesCount(app);

  return {
    ...app,
    ...status,
    metricsSnapshot,
    filesCount
  };
}

async function serializeApps(apps) {
  return Promise.all(apps.map((app) => serializeApp(app)));
}

function invalidateFilesCount(appId) {
  for (const key of filesCountCache.keys()) {
    if (key.startsWith(`${appId}:`)) {
      filesCountCache.delete(key);
    }
  }
}

module.exports = {
  serializeApp,
  serializeApps,
  computeFilesCount,
  invalidateFilesCount
};
