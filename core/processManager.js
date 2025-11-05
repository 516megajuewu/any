const { EventEmitter } = require('events');
const treeKill = require('tree-kill');
const { nanoid } = require('nanoid');
const pty = require('node-pty');

const processes = new Map();
const events = new EventEmitter();

/**
 * Start a managed process. By default this runs in dry-run mode so it can be
 * safely invoked before a concrete implementation is provided.
 * Set options.dryRun to false to spawn a real process via node-pty.
 *
 * @param {string} command
 * @param {string[]} [args]
 * @param {object} [options]
 * @returns {{ id: string, pid?: number | null, status: string, dryRun: boolean }}
 */
function startProcess(command, args = [], options = {}) {
  if (!command || typeof command !== 'string') {
    throw new Error('processManager.startProcess requires a command string');
  }

  const dryRun = options.dryRun !== false;
  const id = nanoid(10);
  const record = {
    id,
    command,
    args,
    options,
    dryRun,
    status: dryRun ? 'pending' : 'running',
    createdAt: Date.now(),
    output: []
  };

  if (dryRun) {
    processes.set(id, record);
    events.emit('start', { id, command, args, dryRun: true });
    return { id, pid: null, status: record.status, dryRun: true };
  }

  const child = pty.spawn(command, args, {
    name: 'xterm-color',
    cwd: options.cwd || process.cwd(),
    env: { ...process.env, ...options.env }
  });

  record.pty = child;
  record.pid = child.pid;

  child.onData((chunk) => {
    record.output.push(chunk);
    if (record.output.length > 200) {
      record.output.shift();
    }
    events.emit('output', { id, chunk });
  });

  child.onExit((exit) => {
    record.status = 'stopped';
    record.exitCode = exit.exitCode;
    record.signal = exit.signal;
    events.emit('exit', { id, exit });
    processes.delete(id);
  });

  processes.set(id, record);
  events.emit('start', { id, command, args, dryRun: false, pid: record.pid });

  return { id, pid: record.pid, status: record.status, dryRun: false };
}

async function stopProcess(id, signal = 'SIGTERM') {
  const record = processes.get(id);
  if (!record) {
    return false;
  }

  if (record.dryRun || !record.pid) {
    processes.delete(id);
    events.emit('stop', { id, dryRun: true });
    return true;
  }

  return new Promise((resolve, reject) => {
    treeKill(record.pid, signal, (error) => {
      if (error && error.code !== 'ESRCH') {
        reject(error);
        return;
      }
      processes.delete(id);
      events.emit('stop', { id, dryRun: false, signal });
      resolve(true);
    });
  });
}

function listProcesses() {
  return Array.from(processes.values()).map(({ pty: _pty, output, ...rest }) => ({
    ...rest,
    output: output.slice(-10)
  }));
}

function getProcess(id) {
  const record = processes.get(id);
  if (!record) {
    return null;
  }
  const { pty: _pty, output, ...rest } = record;
  return { ...rest, output: output.slice(-10) };
}

function clear() {
  processes.clear();
}

module.exports = {
  startProcess,
  stopProcess,
  listProcesses,
  getProcess,
  clear,
  events
};
