const { EventEmitter } = require('events');

const MAX_LINES = 2000;

class RingBuffer {
  constructor() {
    this.lines = [];
  }

  append(line) {
    this.lines.push(line);
    if (this.lines.length > MAX_LINES) {
      this.lines.splice(0, this.lines.length - MAX_LINES);
    }
  }

  clear() {
    this.lines.length = 0;
  }

  toArray() {
    return this.lines.slice();
  }
}

const channels = new Map();
const bus = new EventEmitter();

function ensureChannel(appId) {
  if (!appId) {
    throw new Error('logBus requires a valid appId');
  }

  let channel = channels.get(appId);
  if (!channel) {
    channel = {
      buffer: new RingBuffer(),
      emitter: new EventEmitter(),
      pending: ''
    };
    channels.set(appId, channel);
  }
  return channel;
}

function normalizeChunk(chunk) {
  if (Buffer.isBuffer(chunk)) {
    return chunk.toString('utf8');
  }
  if (typeof chunk === 'string') {
    return chunk;
  }
  return String(chunk ?? '');
}

function append(appId, stream, chunk) {
  const channel = ensureChannel(appId);
  const data = normalizeChunk(chunk);
  if (!data) {
    return;
  }

  const timestamp = Date.now();
  const combined = channel.pending + data;
  const parts = combined.split(/\r?\n/);
  channel.pending = parts.pop();

  for (const message of parts) {
    const entry = {
      appId,
      stream,
      message,
      timestamp
    };
    channel.buffer.append(entry);
    channel.emitter.emit('line', entry);
    bus.emit('log', entry);
  }
}

function flushPending(appId) {
  const channel = ensureChannel(appId);
  if (!channel.pending) {
    return;
  }

  const entry = {
    appId,
    stream: 'stdout',
    message: channel.pending,
    timestamp: Date.now()
  };
  channel.buffer.append(entry);
  channel.emitter.emit('line', entry);
  bus.emit('log', entry);
  channel.pending = '';
}

function reset(appId) {
  const channel = ensureChannel(appId);
  channel.buffer.clear();
  channel.pending = '';
  channel.emitter.emit('reset');
  bus.emit('reset', { appId });
}

function getBuffer(appId) {
  const channel = ensureChannel(appId);
  return channel.buffer.toArray();
}

function subscribe(appId, handler) {
  const channel = ensureChannel(appId);
  const listener = (entry) => handler(entry);
  channel.emitter.on('line', listener);
  return () => {
    channel.emitter.off('line', listener);
  };
}

function onReset(appId, handler) {
  const channel = ensureChannel(appId);
  channel.emitter.on('reset', handler);
  return () => channel.emitter.off('reset', handler);
}

function unsubscribe(appId, handler) {
  const channel = channels.get(appId);
  if (!channel) {
    return;
  }
  channel.emitter.off('line', handler);
}

module.exports = {
  append,
  reset,
  getBuffer,
  subscribe,
  unsubscribe,
  onReset,
  flushPending,
  events: bus
};
