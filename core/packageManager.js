const { spawn } = require('child_process');
const path = require('path');

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || process.cwd(),
      env: { ...process.env, ...options.env },
      stdio: options.stdio || 'inherit',
      shell: options.shell || false
    });

    child.on('error', (error) => reject(error));

    child.on('close', (code, signal) => {
      if (code === 0) {
        resolve({ code, signal });
      } else {
        const error = new Error(
          `${command} ${args.join(' ')} exited with code ${code}`
        );
        error.exitCode = code;
        error.signal = signal;
        reject(error);
      }
    });
  });
}

function buildNodeCommand(packages, options = {}) {
  const manager = options.manager || 'npm';
  const pkgList = Array.isArray(packages) ? packages : [packages];

  switch (manager) {
    case 'yarn':
      return { command: 'yarn', args: ['add', options.saveDev ? '--dev' : null, ...pkgList].filter(Boolean) };
    case 'pnpm':
      return { command: 'pnpm', args: ['add', options.saveDev ? '--save-dev' : null, ...pkgList].filter(Boolean) };
    case 'npm':
    default:
      return { command: 'npm', args: ['install', options.saveDev ? '--save-dev' : null, ...pkgList].filter(Boolean) };
  }
}

function buildPythonCommand(packages, options = {}) {
  const manager = options.manager || 'pip';
  const pkgList = Array.isArray(packages) ? packages : [packages];

  if (manager === 'pipenv') {
    const args = ['install'];
    if (options.dev) {
      args.push('--dev');
    }
    return { command: 'pipenv', args: [...args, ...pkgList] };
  }

  if (manager === 'poetry') {
    const args = ['add'];
    if (options.dev) {
      args.push('--group', typeof options.dev === 'string' ? options.dev : 'dev');
    }
    return { command: 'poetry', args: [...args, ...pkgList] };
  }

  const args = ['install'];
  if (options.requirements) {
    args.push('-r', options.requirements);
  }

  return { command: manager, args: [...args, ...pkgList] };
}

async function installNodePackages(packages, options = {}) {
  const descriptor = buildNodeCommand(packages, options);

  if (options.dryRun !== false) {
    return { ...descriptor, dryRun: true };
  }

  return runCommand(descriptor.command, descriptor.args, options);
}

async function installPythonPackages(packages, options = {}) {
  const descriptor = buildPythonCommand(packages, options);

  if (options.dryRun !== false) {
    return { ...descriptor, dryRun: true };
  }

  return runCommand(descriptor.command, descriptor.args, options);
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
  installNodePackages,
  installPythonPackages,
  getPackageManagerDefaults,
  runCommand
};
