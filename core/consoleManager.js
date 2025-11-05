const { EventEmitter } = require('events');
const pty = require('node-pty');
const { nanoid } = require('nanoid');

const MAX_SESSIONS_PER_APP = 3;
const INACTIVITY_TIMEOUT = 30 * 60 * 1000;
const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;

const sessions = new Map();
const events = new EventEmitter();

let cleanupTimer;

function init() {
  if (cleanupTimer) {
    return;
  }

  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [sessionId, session] of sessions.entries()) {
      if (now - session.lastActivity > INACTIVITY_TIMEOUT) {
        destroySession(sessionId, 'inactivity-timeout');
      }
    }
  }, 60000);
}

function getSessionsByApp(appId) {
  const result = [];
  for (const [sessionId, session] of sessions.entries()) {
    if (session.appId === appId) {
      result.push({
        sessionId,
        appId: session.appId,
        shell: session.shell,
        cols: session.cols,
        rows: session.rows,
        created: session.created,
        lastActivity: session.lastActivity,
        alive: session.pty && !session.pty.killed
      });
    }
  }
  return result;
}

function createSession(appId, { shell, env, cols, rows, token } = {}) {
  if (!appId) {
    throw new Error('appId is required');
  }

  const existing = getSessionsByApp(appId);
  if (existing.length >= MAX_SESSIONS_PER_APP) {
    throw new Error(`Maximum ${MAX_SESSIONS_PER_APP} console sessions per app`);
  }

  const sessionId = nanoid(16);
  const effectiveCols = cols || DEFAULT_COLS;
  const effectiveRows = rows || DEFAULT_ROWS;

  const isWindows = process.platform === 'win32';
  const defaultShell = isWindows ? 'powershell.exe' : process.env.SHELL || '/bin/bash';

  let ptyProcess;
  try {
    ptyProcess = pty.spawn(shell || defaultShell, [], {
      name: 'xterm-256color',
      cols: effectiveCols,
      rows: effectiveRows,
      cwd: env?.cwd || process.cwd(),
      env: env ? { ...process.env, ...env } : process.env
    });
  } catch (error) {
    throw new Error(`Failed to spawn PTY: ${error.message}`);
  }

  const session = {
    appId,
    pty: ptyProcess,
    shell: shell || defaultShell,
    cols: effectiveCols,
    rows: effectiveRows,
    created: Date.now(),
    lastActivity: Date.now(),
    token: token || null
  };

  sessions.set(sessionId, session);

  ptyProcess.onData((data) => {
    session.lastActivity = Date.now();
    events.emit('data', { sessionId, appId, data });
  });

  ptyProcess.onExit(({ exitCode, signal }) => {
    const exitSession = sessions.get(sessionId);
    if (exitSession) {
      sessions.delete(sessionId);
      events.emit('terminated', {
        sessionId,
        appId: exitSession.appId,
        exitCode,
        signal,
        reason: 'process-exit'
      });
    }
  });

  events.emit('created', {
    sessionId,
    appId,
    shell: session.shell,
    cols: effectiveCols,
    rows: effectiveRows,
    created: session.created
  });

  return {
    sessionId,
    shell: session.shell,
    cols: effectiveCols,
    rows: effectiveRows,
    created: session.created
  };
}

function writeInput(sessionId, data) {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  if (!session.pty || session.pty.killed) {
    throw new Error('Session terminated');
  }

  session.lastActivity = Date.now();
  session.pty.write(data);
}

function resize(sessionId, cols, rows) {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  if (!session.pty || session.pty.killed) {
    throw new Error('Session terminated');
  }

  const effectiveCols = Math.max(1, cols || session.cols);
  const effectiveRows = Math.max(1, rows || session.rows);

  session.pty.resize(effectiveCols, effectiveRows);
  session.cols = effectiveCols;
  session.rows = effectiveRows;
  session.lastActivity = Date.now();

  events.emit('resized', { sessionId, appId: session.appId, cols: effectiveCols, rows: effectiveRows });
}

function destroySession(sessionId, reason = 'manual') {
  const session = sessions.get(sessionId);
  if (!session) {
    return false;
  }

  try {
    if (session.pty && !session.pty.killed) {
      session.pty.kill();
    }
  } catch (error) {
    events.emit('error', { sessionId, error, message: 'Failed to kill PTY' });
  }

  sessions.delete(sessionId);
  events.emit('terminated', {
    sessionId,
    appId: session.appId,
    reason,
    exitCode: null,
    signal: null
  });

  return true;
}

function destroyAllSessionsForApp(appId, reason = 'app-stopped') {
  const appSessions = getSessionsByApp(appId);
  for (const { sessionId } of appSessions) {
    destroySession(sessionId, reason);
  }
  return appSessions.length;
}

function getSession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) {
    return null;
  }

  return {
    sessionId,
    appId: session.appId,
    shell: session.shell,
    cols: session.cols,
    rows: session.rows,
    created: session.created,
    lastActivity: session.lastActivity,
    alive: session.pty && !session.pty.killed
  };
}

function listSessions() {
  const result = [];
  for (const [sessionId, session] of sessions.entries()) {
    result.push({
      sessionId,
      appId: session.appId,
      shell: session.shell,
      cols: session.cols,
      rows: session.rows,
      created: session.created,
      lastActivity: session.lastActivity,
      alive: session.pty && !session.pty.killed
    });
  }
  return result;
}

function shutdown() {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }

  for (const [sessionId] of sessions.entries()) {
    destroySession(sessionId, 'shutdown');
  }

  sessions.clear();
}

module.exports = {
  init,
  createSession,
  writeInput,
  resize,
  destroySession,
  destroyAllSessionsForApp,
  getSession,
  getSessionsByApp,
  listSessions,
  shutdown,
  events
};
