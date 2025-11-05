const { spawn } = require('child_process');
const path = require('path');
const logBus = require('./logBus');

const isWindows = process.platform === 'win32';

function spawnWithLogs(appId, command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || process.cwd(),
      env: { ...process.env, ...options.env },
      shell: isWindows,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const commandLine = `${command} ${args.join(' ')}`.trim();
    logBus.append(appId, 'stdout', `[pkg] Running ${commandLine}`);

    child.stdout?.on('data', (chunk) => {
      logBus.append(appId, 'stdout', chunk);
    });

    child.stderr?.on('data', (chunk) => {
      logBus.append(appId, 'stderr', chunk);
    });

    child.on('error', (error) => {
      logBus.append(appId, 'stderr', `[pkg] Error: ${error.message}`);
      logBus.flushPending(appId);
      reject(error);
    });

    child.on('close', (code, signal) => {
      logBus.append(appId, code === 0 ? 'stdout' : 'stderr', `[pkg] Exit code: ${code}${signal ? ` (signal ${signal})` : ''}`);
      logBus.flushPending(appId);
      if (code === 0) {
        resolve({ code, signal });
      } else {
        const error = new Error(`${command} exited with code ${code}`);
        error.exitCode = code;
        error.signal = signal;
        reject(error);
      }
    });
  });
}

function installNode(appId, manager = 'npm', args = [], options = {}) {
  const normalizedManager = manager || 'npm';
  const finalArgs = Array.isArray(args) && args.length > 0 ? args.slice() : ['install'];
  return spawnWithLogs(appId, normalizedManager, finalArgs, options);
}

function installPython(appId, manager = 'pip', args = [], options = {}) {
  const normalizedManager = manager || 'pip';
  const finalArgs = Array.isArray(args) ? args.slice() : [];

  if (options.indexUrl) {
    finalArgs.push('--index-url', options.indexUrl);
  }

  if (finalArgs.length === 0) {
    finalArgs.push('install');
  }

  return spawnWithLogs(appId, normalizedManager, finalArgs, options);
}

function getPackageManagerDefaults() {
  return {
    node: process.env.NODE_PACKAGE_MANAGER || 'npm',
    python: process.env.PYTHON_PACKAGE_MANAGER || 'pip',
    cwd: process.cwd(),
    cacheDir: path.join(process.cwd(), '.pm-cache')
  };
}

module.exports = {
  installNode,
  installPython,
  getPackageManagerDefaults
};
