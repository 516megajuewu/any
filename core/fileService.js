const path = require('path');
const fs = require('fs-extra');
const fg = require('fast-glob');
const multer = require('multer');
const unzipper = require('unzipper');

const repositoryRoot = path.resolve(process.cwd());
const DEFAULT_BASE = 'apps';

const BASE_WHITELIST = Object.freeze({
  apps: path.join(repositoryRoot, 'apps'),
  root: repositoryRoot
});

fs.ensureDirSync(BASE_WHITELIST.apps);

function normalizePosix(relativePath) {
  return (relativePath || '').replace(/\\/g, '/');
}

function getBaseDirectory(base = DEFAULT_BASE) {
  const key = base || DEFAULT_BASE;
  const dir = BASE_WHITELIST[key];

  if (!dir) {
    throw new Error(`Invalid base directory. Allowed: ${Object.keys(BASE_WHITELIST).join(', ')}`);
  }

  return dir;
}

async function ensureBaseDirectory(base = DEFAULT_BASE) {
  const dir = getBaseDirectory(base);
  await fs.ensureDir(dir);
  return dir;
}

function resolveSafePath(targetPath = '.', options = {}) {
  let baseDir;

  if (typeof options === 'string') {
    if (BASE_WHITELIST[options]) {
      baseDir = getBaseDirectory(options);
    } else {
      baseDir = path.resolve(options);
    }
  } else if (options && typeof options === 'object') {
    if (options.baseDir) {
      baseDir = path.resolve(options.baseDir);
    } else {
      const baseKey = options.base || DEFAULT_BASE;
      baseDir = getBaseDirectory(baseKey);
    }
  } else {
    baseDir = getBaseDirectory(DEFAULT_BASE);
  }

  const sanitizedTarget = targetPath === undefined || targetPath === null || targetPath === ''
    ? '.'
    : targetPath;

  const destination = path.resolve(baseDir, sanitizedTarget);

  if (!destination.startsWith(baseDir)) {
    throw new Error('Attempted to access a path outside of the allowed directory');
  }

  return destination;
}

function toRelativePath(absolutePath, base = DEFAULT_BASE) {
  const baseDir = getBaseDirectory(base);
  const relative = path.relative(baseDir, absolutePath);
  return normalizePosix(relative);
}

async function listDirectory(targetPath = '.', options = {}) {
  const { base = DEFAULT_BASE } = options;
  const directoryPath = resolveSafePath(targetPath, { base });

  const stats = await fs.stat(directoryPath);
  if (!stats.isDirectory()) {
    throw new Error('Path is not a directory');
  }

  const entries = await fs.readdir(directoryPath, { withFileTypes: true });

  const items = await Promise.all(entries.map(async (entry) => {
    const absoluteEntryPath = path.join(directoryPath, entry.name);
    const entryStats = await fs.stat(absoluteEntryPath);
    const isDirectory = entryStats.isDirectory();
    let hasChildren = false;

    if (isDirectory) {
      try {
        const children = await fs.readdir(absoluteEntryPath);
        hasChildren = children.length > 0;
      } catch (error) {
        hasChildren = false;
      }
    }

    return {
      name: entry.name,
      path: normalizePosix(path.relative(getBaseDirectory(base), absoluteEntryPath)),
      type: isDirectory ? 'directory' : 'file',
      size: entryStats.size,
      mtime: entryStats.mtime,
      ctime: entryStats.ctime,
      hasChildren
    };
  }));

  items.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'directory' ? -1 : 1;
    }
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });

  const relativePath = normalizePosix(path.relative(getBaseDirectory(base), directoryPath)) || '.';

  return {
    base,
    path: relativePath,
    items
  };
}

async function statFile(targetPath, options = {}) {
  const { base = DEFAULT_BASE } = options;
  const filePath = resolveSafePath(targetPath, { base });
  const stats = await fs.stat(filePath);

  return {
    name: path.basename(filePath),
    path: normalizePosix(path.relative(getBaseDirectory(base), filePath)),
    type: stats.isDirectory() ? 'directory' : 'file',
    size: stats.size,
    mtime: stats.mtime,
    ctime: stats.ctime
  };
}

async function readFile(targetPath, options = {}) {
  const { base = DEFAULT_BASE, encoding = 'utf8' } = options;
  const filePath = resolveSafePath(targetPath, { base });
  const stats = await fs.stat(filePath);

  if (!stats.isFile()) {
    throw new Error('Path is not a file');
  }

  return fs.readFile(filePath, encoding);
}

async function writeFile(targetPath, contents, options = {}) {
  const { base = DEFAULT_BASE, encoding = 'utf8' } = options;

  if (typeof contents !== 'string' && !Buffer.isBuffer(contents)) {
    throw new Error('Contents must be a string or Buffer');
  }

  const filePath = resolveSafePath(targetPath, { base });
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, contents, encoding);
  return filePath;
}

async function makeDirectory(targetPath, options = {}) {
  const { base = DEFAULT_BASE } = options;
  const dirPath = resolveSafePath(targetPath, { base });

  await fs.ensureDir(dirPath);
  return dirPath;
}

async function remove(targetPath, options = {}) {
  const { base = DEFAULT_BASE } = options;
  const target = resolveSafePath(targetPath, { base });
  const baseDir = getBaseDirectory(base);

  if (target === baseDir) {
    throw new Error('Cannot remove the base directory');
  }

  await fs.remove(target);
  return target;
}

async function renamePath(srcPath, destPath, options = {}) {
  const { base = DEFAULT_BASE, overwrite = false } = options;

  if (!destPath || typeof destPath !== 'string') {
    throw new Error('Destination path is required');
  }

  const source = resolveSafePath(srcPath, { base });
  const destination = resolveSafePath(destPath, { base });
  const baseDir = getBaseDirectory(base);

  if (source === baseDir) {
    throw new Error('Cannot rename the base directory');
  }

  await fs.ensureDir(path.dirname(destination));
  await fs.move(source, destination, { overwrite });
  return destination;
}

async function globFiles(patterns, options = {}) {
  const { base = DEFAULT_BASE, cwd = '.' } = options;
  const searchRoot = resolveSafePath(cwd, { base });
  const results = await fg(patterns, {
    cwd: searchRoot,
    dot: options.dot ?? false
  });

  return results.map((result) => normalizePosix(path.join(cwd === '.' ? '' : normalizePosix(cwd), result)).replace(/^\/+/, ''));
}

function createUploadHandler(options = {}) {
  return multer({
    storage: multer.memoryStorage(),
    ...options
  });
}

async function extractArchive(input, destination = '.', options = {}) {
  const { concurrency = 5 } = options;
  const baseOption = options.baseDir
    ? { baseDir: options.baseDir }
    : { base: options.base || DEFAULT_BASE };

  const outputDir = resolveSafePath(destination, baseOption);
  await fs.ensureDir(outputDir);

  if (Buffer.isBuffer(input)) {
    const directory = await unzipper.Open.buffer(input);
    await directory.extract({ path: outputDir, concurrency });
    return outputDir;
  }

  if (input && typeof input.pipe === 'function') {
    await new Promise((resolve, reject) => {
      input
        .pipe(unzipper.Extract({ path: outputDir }))
        .once('close', resolve)
        .once('error', reject);
    });
    return outputDir;
  }

  throw new Error('Unsupported archive input');
}

module.exports = {
  repositoryRoot,
  DEFAULT_BASE,
  BASE_WHITELIST,
  ensureBaseDirectory,
  getBaseDirectory,
  resolveSafePath,
  toRelativePath,
  listDirectory,
  statFile,
  readFile,
  writeFile,
  makeDirectory,
  remove,
  rename: renamePath,
  globFiles,
  createUploadHandler,
  extractArchive
};
