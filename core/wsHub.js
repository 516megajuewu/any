const { EventEmitter } = require('events');
const { WebSocketServer, WebSocket } = require('ws');

const DEFAULT_PATH = '/ws';
const HEARTBEAT_INTERVAL = 30000;

const events = new EventEmitter();
const clients = new Set();
const channels = new Map(); // channel -> Set<WebSocket>

let wss;
let serverRef;
let heartbeatTimer;

function init({ server, path = DEFAULT_PATH } = {}) {
  if (!server) {
    throw new Error('wsHub.init requires a server instance');
  }

  if (wss) {
    return wss;
  }

  serverRef = server;
  wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    if (request.url !== path) {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  wss.on('connection', (socket) => {
    addClient(socket);
  });

  heartbeatTimer = setInterval(runHeartbeat, HEARTBEAT_INTERVAL);

  return wss;
}

function runHeartbeat() {
  for (const socket of clients) {
    if (socket.readyState !== WebSocket.OPEN) {
      continue;
    }
    if (socket.isAlive === false) {
      socket.terminate();
      continue;
    }

    socket.isAlive = false;
    try {
      socket.ping(() => {});
    } catch (error) {
      events.emit('error', { error, socket });
    }
  }

  broadcast({
    type: 'heartbeat',
    clients: clients.size,
    channels: channels.size,
    timestamp: Date.now()
  });
}

function addClient(socket) {
  socket.isAlive = true;
  socket.clientChannels = new Set();

  socket.on('pong', () => {
    socket.isAlive = true;
  });

  socket.on('message', (raw) => {
    handleClientMessage(socket, raw);
  });

  socket.on('close', () => {
    removeClient(socket);
  });

  socket.on('error', (error) => {
    events.emit('error', { error, socket });
  });

  clients.add(socket);

  send(socket, {
    type: 'connection',
    message: 'connected',
    timestamp: Date.now()
  });

  events.emit('client-connected', { socket });
}

function removeClient(socket) {
  clients.delete(socket);
  if (socket.clientChannels) {
    for (const channel of socket.clientChannels) {
      unsubscribeSocket(channel, socket);
    }
  }
  events.emit('client-disconnected', { socket });
}

function handleClientMessage(socket, raw) {
  let message;
  try {
    message = typeof raw === 'string' ? JSON.parse(raw) : JSON.parse(raw.toString());
  } catch (error) {
    send(socket, {
      type: 'error',
      error: 'invalid-json',
      message: error.message
    });
    return;
  }

  const { action, type, channel, topic, appId } = message;

  if (action === 'ping' || type === 'ping') {
    send(socket, { type: 'pong', timestamp: Date.now() });
    return;
  }

  if (action === 'subscribe' || type === 'subscribe') {
    const key = channel || buildChannelKey(topic || message.event, appId || message.target);
    if (!key) {
      send(socket, { type: 'error', error: 'invalid-channel' });
      return;
    }
    subscribeSocket(key, socket);
    send(socket, { type: 'subscribed', channel: key, timestamp: Date.now() });
    return;
  }

  if (action === 'unsubscribe' || type === 'unsubscribe') {
    const key = channel || buildChannelKey(topic || message.event, appId || message.target);
    if (!key) {
      send(socket, { type: 'error', error: 'invalid-channel' });
      return;
    }
    unsubscribeSocket(key, socket);
    send(socket, { type: 'unsubscribed', channel: key, timestamp: Date.now() });
    return;
  }

  events.emit('message', { socket, message });
}

function buildChannelKey(topic, appId) {
  if (!topic) {
    return null;
  }
  if (appId) {
    return `${topic}:${appId}`;
  }
  return topic;
}

function subscribeSocket(channel, socket) {
  if (!channel || typeof channel !== 'string') {
    return;
  }

  let subscribers = channels.get(channel);
  if (!subscribers) {
    subscribers = new Set();
    channels.set(channel, subscribers);
  }

  subscribers.add(socket);
  socket.clientChannels?.add(channel);
  events.emit('subscribe', { channel, socket });
}

function unsubscribeSocket(channel, socket) {
  const subscribers = channels.get(channel);
  if (!subscribers) {
    return;
  }

  subscribers.delete(socket);
  socket.clientChannels?.delete(channel);

  if (subscribers.size === 0) {
    channels.delete(channel);
  }

  events.emit('unsubscribe', { channel, socket });
}

function send(socket, payload) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return false;
  }

  try {
    socket.send(JSON.stringify(payload));
    return true;
  } catch (error) {
    events.emit('error', { error, socket });
    return false;
  }
}

function broadcast(payload) {
  const data = JSON.stringify(payload);
  let sent = 0;
  for (const socket of clients) {
    if (socket.readyState === WebSocket.OPEN) {
      try {
        socket.send(data);
        sent += 1;
      } catch (error) {
        events.emit('error', { error, socket });
      }
    }
  }
  return sent;
}

function broadcastToChannel(channel, payload) {
  const subscribers = channels.get(channel);
  if (!subscribers || subscribers.size === 0) {
    return 0;
  }

  const data = JSON.stringify(payload);
  let sent = 0;

  for (const socket of subscribers) {
    if (socket.readyState === WebSocket.OPEN) {
      try {
        socket.send(data);
        sent += 1;
      } catch (error) {
        events.emit('error', { error, socket });
      }
    }
  }

  return sent;
}

function publish(eventType, payload = {}, { appId, broadcastGlobal = true } = {}) {
  const message = {
    type: eventType,
    appId: appId ?? payload.appId,
    payload,
    timestamp: Date.now()
  };

  if (broadcastGlobal) {
    broadcast(message);
  }

  if (appId) {
    broadcastToChannel(`${eventType}:${appId}`, message);
  }
}

function publishStatus(appId, status) {
  publish('app.status', { status }, { appId });
}

function publishMetrics(appId, metrics) {
  publish('app.metrics', metrics, { appId });
}

function publishLog(appId, logEntry) {
  publish('app.logs', logEntry, { appId });
  // Backwards-compatible channel for logs
  broadcastToChannel(`logs:${appId}`, {
    type: 'app.logs',
    appId,
    payload: logEntry,
    timestamp: Date.now()
  });
}

function publishList(apps) {
  publish('app.list', { apps });
}

function publishCoreReload(info) {
  broadcast({
    type: 'core:reloaded',
    info,
    timestamp: Date.now()
  });
}

function shutdown() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  for (const socket of clients) {
    try {
      socket.close();
    } catch (error) {
      events.emit('error', { error, socket });
    }
  }

  clients.clear();
  channels.clear();

  if (wss) {
    wss.close();
    wss = null;
  }

  serverRef = null;
}

module.exports = {
  init,
  addClient,
  send,
  broadcast,
  broadcastToChannel,
  publish,
  publishStatus,
  publishMetrics,
  publishLog,
  publishList,
  publishCoreReload,
  shutdown,
  clients,
  channels,
  events
};
