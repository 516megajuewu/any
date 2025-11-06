const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const treeKill = require('tree-kill');
const logBus = require('./logBus');
const { PROCESS } = require('./constants');

const isWindows = process.platform === 'win32';
const processes = new Map();
const events = new EventEmitter();

function ensureRecord(id) {
  let record = processes.get(id);
  if (!record) {
    record = {
      id,
      cmd: null,
      cwd: process.cwd(),
      env: {},
      pid: null,
      status: 'stopped',
      startTime: null,
      stopTime: null,
      exitCode: null,
      signal: null,
      error: null,
      restarts: 0,
      process: null
    };
    processes.set(id, record);
  }
  return record;
}

function parseCommand(cmd) {
  if (!cmd || typeof cmd !== 'string') {
    throw new Error('Command must be a non-empty string');
  }
  const parts = cmd
    .trim()
    .match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
  if (parts.length === 0) {
    throw new Error('Unable to parse command');
  }
  return parts.map((part) => part.replace(/^["']|["']$/g, ''));
}

function emitStatus(record, extra = {}) {
  const payload = {
    id: record.id,
    status: record.status,
    pid: record.pid,
    startTime: record.startTime,
    stopTime: record.stopTime,
    exitCode: record.exitCode,
    signal: record.signal,
    error: record.error,
    restarts: record.restarts,
    ...extra
  };
  events.emit('status', payload);
  return payload;
}

function startApp({ id, cwd, cmd, env }) {
  if (!id) {
    throw new Error('startApp requires an id');
  }
  if (!cmd) {
    throw new Error('startApp requires a cmd');
  }

  const record = ensureRecord(id);

  if (record.status === 'running') {
    throw new Error(`App ${id} is already running`);
  }

  logBus.reset(id);

  const parts = parseCommand(cmd);
  const command = parts[0];
  const args = parts.slice(1);

  record.cmd = cmd;
  record.cwd = cwd || record.cwd || process.cwd();
  record.env = env || {};
  record.status = 'starting';
  record.exitCode = null;
  record.signal = null;
  record.error = null;
  record.startTime = Date.now();
  record.stopTime = null;

  const child = spawn(command, args, {
    cwd: record.cwd,
    env: { ...process.env, ...record.env },
    shell: isWindows
  });

  record.process = child;
  record.pid = child.pid;
  record.status = 'running';

  emitStatus(record, { pid: child.pid, startTime: record.startTime });
  events.emit('start', { id, pid: child.pid, startTime: record.startTime });

  if (child.stdout) {
    child.stdout.on('data', (chunk) => {
      logBus.append(id, 'stdout', chunk);
    });
  }

  if (child.stderr) {
    child.stderr.on('data', (chunk) => {
      logBus.append(id, 'stderr', chunk);
    });
  }

  child.on('error', (error) => {
    record.status = 'error';
    record.error = error.message;
    record.process = null;
    record.pid = null;
    emitStatus(record, { error: error.message });
    events.emit('error', { id, error });
    logBus.append(id, 'stderr', `Process error: ${error.message}`);
    logBus.flushPending(id);
  });

  child.on('exit', (code, signal) => {
    record.status = 'stopped';
    record.exitCode = code;
    record.signal = signal;
    record.stopTime = Date.now();
    record.process = null;
    record.pid = null;
    emitStatus(record, { exitCode: code, signal });
    events.emit('exit', { id, exitCode: code, signal });
    logBus.flushPending(id);
  });

  return {
    id,
    pid: record.pid,
    status: record.status,
    startTime: record.startTime
  };
}

function stopApp(id, signal = PROCESS.STOP_SIGNAL) {
  const record = ensureRecord(id);

  if (record.status !== 'running' || !record.process || !record.pid) {
    record.status = 'stopped';
    record.pid = null;
    record.process = null;
    record.stopTime = Date.now();
    emitStatus(record, { reason: 'not-running' });
    return Promise.resolve({ id, stopped: false });
  }

  return new Promise((resolve, reject) => {
    const child = record.process;
    const onExit = (exitCode, exitSignal) => {
      child.off('exit', onExit);
      resolve({ id, stopped: true, exitCode, signal: exitSignal });
    };

    child.once('exit', onExit);

    treeKill(record.pid, signal, (error) => {
      if (error && error.code !== 'ESRCH') {
        child.off('exit', onExit);
        reject(error);
        return;
      }
      events.emit('stop', { id, signal });
    });
  });
}

async function restartApp(id) {
  const record = ensureRecord(id);
  if (!record.cmd) {
    throw new Error(`App ${id} has not been started yet`);
  }

  record.restarts += 1;
  await stopApp(id);
  await new Promise((resolve) => setTimeout(resolve, PROCESS.RESTART_DELAY));
  return startApp({ id, cwd: record.cwd, cmd: record.cmd, env: record.env });
}

function getStatus(id) {
  const record = processes.get(id);
  if (!record) {
    return null;
  }
  const { process, ...rest } = record;
  return { ...rest };
}

function streamLogs(id, handler) {
  if (typeof handler === 'function') {
    return logBus.subscribe(id, handler);
  }
  return {
    lines: logBus.getBuffer(id),
    subscribe: (listener) => logBus.subscribe(id, listener)
  };
}

function listApps() {
  return Array.from(processes.values()).map(({ process, ...rest }) => ({ ...rest }));
}

async function stopAll() {
  const running = Array.from(processes.values()).filter((app) => app.status === 'running');
  const results = await Promise.allSettled(
    running.map((app) => stopApp(app.id))
  );
  
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      const app = running[index];
      logBus.append(app.id, 'stderr', `Failed to stop: ${result.reason?.message || 'Unknown error'}`);
      events.emit('error', { id: app.id, error: result.reason });
    }
  });
}

module.exports = {
  startApp,
  stopApp,
  restartApp,
  getStatus,
  streamLogs,
  listApps,
  stopAll,
  events
};
