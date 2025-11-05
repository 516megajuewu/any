type EventName = 'open' | 'close' | 'error' | 'message';

type Listener<T = unknown> = (payload: T) => void;

type ListenerMap = Record<EventName, Set<Listener>>;

export interface EventsClient {
  on<T = unknown>(event: EventName, handler: Listener<T>): () => void;
  send(message: any): void;
  close(): void;
  readonly status: number;
}

const DEFAULT_RECONNECT_DELAY = 4000;

function buildWebSocketUrl() {
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL;
  }

  if (import.meta.env.DEV) {
    return 'ws://localhost:3000/ws';
  }

  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${window.location.host}/ws`;
}

export function createEventsClient(url = buildWebSocketUrl()): EventsClient {
  const listeners: ListenerMap = {
    open: new Set(),
    close: new Set(),
    error: new Set(),
    message: new Set()
  };

  let socket: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const emit = <T>(event: EventName, payload: T) => {
    listeners[event].forEach((listener) => {
      try {
        listener(payload);
      } catch (error) {
        console.error('Event listener error', error);
      }
    });
  };

  const scheduleReconnect = () => {
    if (!import.meta.env.DEV) {
      return;
    }

    if (reconnectTimer) {
      return;
    }

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, DEFAULT_RECONNECT_DELAY);
  };

  const connect = () => {
    socket = new WebSocket(url);

    socket.addEventListener('open', () => {
      emit('open', undefined);
    });

    socket.addEventListener('close', () => {
      emit('close', undefined);
      scheduleReconnect();
    });

    socket.addEventListener('error', (event) => {
      emit('error', event);
    });

    socket.addEventListener('message', (event) => {
      let payload: unknown = event.data;
      if (typeof event.data === 'string') {
        try {
          payload = JSON.parse(event.data);
        } catch (error) {
          // ignore malformed JSON payloads
        }
      }
      emit('message', payload);
    });
  };

  connect();

  return {
    on(event, handler) {
      listeners[event].add(handler as Listener);
      return () => listeners[event].delete(handler as Listener);
    },
    send(message: any) {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(typeof message === 'string' ? message : JSON.stringify(message));
      }
    },
    close() {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      socket?.close();
    },
    get status() {
      return socket?.readyState ?? WebSocket.CLOSED;
    }
  };
}
