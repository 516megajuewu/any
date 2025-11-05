const { EventEmitter } = require('events');
const pidusage = require('pidusage');

const POLL_INTERVAL = 1000;

const contexts = new Map();
const events = new EventEmitter();

function ensureContext(appId) {
  if (!appId || typeof appId !== 'string') {
    throw new Error('metrics requires a valid appId');
  }
  let context = contexts.get(appId);
  if (!context) {
    context = {
      appId,
      pid: null,
      timer: null,
      polling: false,
      subscribers: new Set(),
      lastSnapshot: null,
      getPid: null
    };
    contexts.set(appId, context);
  }
  return context;
}

async function poll(appId, context) {
  if (context.polling) {
    return;
  }
  const pid = context.pid ?? (typeof context.getPid === 'function' ? context.getPid() : null);
  if (!pid) {
    return;
  }

  context.polling = true;
  try {
    const stats = await pidusage(pid);
    const snapshot = {
      appId,
      pid,
      cpu: stats.cpu,
      memory: stats.memory,
      uptime: stats.elapsed,
      timestamp: Date.now()
    };
    context.lastSnapshot = snapshot;
    for (const subscriber of context.subscribers) {
      try {
        subscriber(snapshot);
      } catch (error) {
        events.emit('error', { appId, error });
      }
    }
    events.emit('metrics', snapshot);
  } catch (error) {
    if (error && (error.code === 'ENOENT' || error.code === 'ESRCH')) {
      pidusage.clear(pid);
      context.pid = null;
      context.lastSnapshot = {
        appId,
        pid,
        cpu: 0,
        memory: 0,
        uptime: 0,
        timestamp: Date.now(),
        stale: true
      };
      for (const subscriber of context.subscribers) {
        try {
          subscriber(context.lastSnapshot);
        } catch (innerError) {
          events.emit('error', { appId, error: innerError });
        }
      }
      events.emit('metrics', context.lastSnapshot);
      stopTimer(context);
      return;
    }
    events.emit('error', { appId, error });
  } finally {
    context.polling = false;
  }
}

function startTimer(context) {
  if (context.timer) {
    return;
  }
  context.timer = setInterval(() => poll(context.appId, context), POLL_INTERVAL);
}

function stopTimer(context) {
  if (context.timer) {
    clearInterval(context.timer);
    context.timer = null;
  }
}

function subscribe(appId, callback) {
  if (typeof callback !== 'function') {
    throw new Error('metrics.subscribe requires a callback function');
  }

  const context = ensureContext(appId);
  context.subscribers.add(callback);

  if (context.lastSnapshot) {
    try {
      callback(context.lastSnapshot);
    } catch (error) {
      events.emit('error', { appId, error });
    }
  }

  if (context.pid || context.getPid) {
    startTimer(context);
  }

  return () => unsubscribe(appId, callback);
}

function unsubscribe(appId, callback) {
  const context = contexts.get(appId);
  if (!context) {
    return false;
  }

  const removed = context.subscribers.delete(callback);
  if (context.subscribers.size === 0 && !context.pid) {
    stopTimer(context);
  }
  return removed;
}

function track(appId, pid) {
  const context = ensureContext(appId);
  context.pid = typeof pid === 'number' ? pid : null;
  if (context.pid) {
    startTimer(context);
  } else if (context.subscribers.size === 0) {
    stopTimer(context);
  }
}

function setPidResolver(appId, resolver) {
  const context = ensureContext(appId);
  context.getPid = typeof resolver === 'function' ? resolver : null;
  if (context.getPid || context.pid) {
    startTimer(context);
  } else if (context.subscribers.size === 0) {
    stopTimer(context);
  }
}

function getSnapshot(appId) {
  const context = contexts.get(appId);
  return context ? context.lastSnapshot : null;
}

function resetMetrics(pid) {
  if (pid) {
    pidusage.clear(pid);
    return;
  }
  pidusage.clear();
}

function clearAll() {
  for (const context of contexts.values()) {
    stopTimer(context);
  }
  contexts.clear();
  pidusage.clear();
}

module.exports = {
  subscribe,
  unsubscribe,
  track,
  setPidResolver,
  getSnapshot,
  resetMetrics,
  clearAll,
  events
};
