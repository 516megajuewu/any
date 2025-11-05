const path = require('path');
const fs = require('fs-extra');
const fg = require('fast-glob');
const multer = require('multer');
const unzipper = require('unzipper');

const repositoryRoot = path.resolve(process.cwd());

function resolveSafePath(targetPath = '.', baseDir = repositoryRoot) {
  const root = path.resolve(baseDir);
  const destination = path.resolve(root, targetPath);

  if (!destination.startsWith(root)) {
    throw new Error('Attempted to access a path outside of the allowed directory');
  }

  return destination;
}

async function listDirectory(targetPath = '.', options = {}) {
  const base = resolveSafePath(targetPath, options.baseDir || repositoryRoot);
  const entries = await fs.readdir(base, { withFileTypes: true });

  return entries.map((entry) => ({
    name: entry.name,
    path: path.posix.join(targetPath.replaceAll('\\', '/'), entry.name),
    type: entry.isDirectory() ? 'directory' : 'file'
  }));
}

async function globFiles(patterns, options = {}) {
  const cwd = resolveSafePath(options.baseDir || '.', options.rootDir || repositoryRoot);
  const results = await fg(patterns, {
    cwd,
    dot: options.dot || false
  });
  return results.map((result) => result.replaceAll('\\', '/'));
}

async function readFile(targetPath, options = {}) {
  const filePath = resolveSafePath(targetPath, options.baseDir || repositoryRoot);
  return fs.readFile(filePath, options.encoding || 'utf8');
}

async function writeFile(targetPath, contents, options = {}) {
  const filePath = resolveSafePath(targetPath, options.baseDir || repositoryRoot);
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, contents, options.encoding || 'utf8');
  return filePath;
}

function createUploadHandler(options = {}) {
  return multer({
    storage: multer.memoryStorage(),
    ...options
  });
}

async function extractArchive(input, destination, options = {}) {
  const outputDir = resolveSafePath(destination, options.baseDir || repositoryRoot);
  await fs.ensureDir(outputDir);

  if (Buffer.isBuffer(input)) {
    const directory = await unzipper.Open.buffer(input);
    await directory.extract({ path: outputDir, concurrency: options.concurrency || 5 });
    return outputDir;
  }

  if (typeof input.pipe === 'function') {
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
  resolveSafePath,
  listDirectory,
  globFiles,
  readFile,
  writeFile,
  createUploadHandler,
  extractArchive
};
