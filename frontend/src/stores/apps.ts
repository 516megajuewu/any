import { defineStore } from 'pinia';
import { apiClient } from '@/services/api';

interface AppMetricsPoint {
  timestamp: number;
  cpu: number;
  memory: number;
}

interface AppMetricsSnapshot {
  timestamp: number;
  cpu: number;
  memory: number;
}

interface AppProcessStatus {
  id: string;
  status: string;
  pid: number | null;
  startTime: number | null;
  stopTime: number | null;
  exitCode: number | null;
  signal: string | null;
  error: string | null;
  restarts: number;
}

interface AppLogEntryModel {
  timestamp: number;
  stream: string;
  line: string;
}

interface AppActivityEventModel {
  type: string;
  message?: string;
  timestamp: number;
}

export interface AppModel extends AppProcessStatus {
  name: string;
  type: string;
  cwd: string;
  startCmd: string;
  env: Record<string, string>;
  metricsSnapshot?: AppMetricsSnapshot | null;
  metricsHistory: AppMetricsPoint[];
  filesCount: number | null;
  createdAt: number | null;
  updatedAt: number | null;
  installState: 'idle' | 'installing' | 'success' | 'error';
  lastInstallAt: number | null;
  installMessage: string | null;
  lastLogEntry: AppLogEntryModel | null;
  lastEvent: AppActivityEventModel | null;
  isInstalling: boolean;
  isWorking: boolean;
}

export interface WebSocketClient {
  on<T = unknown>(event: 'open' | 'close' | 'error' | 'message', handler: (payload: T) => void): () => void;
  close(): void;
}

interface AppsState {
  apps: AppModel[];
  selectedAppId: string | null;
  order: string[];
  isLoading: boolean;
  error: string | null;
  subscriptions: Map<string, () => void>;
  reconnectAttempts: number;
}

const MAX_HISTORY_POINTS = 60;

function normalizeMetrics(value?: number | null) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0;
  }
  return Math.max(0, Math.round(value * 10) / 10);
}

function createAppModel(app: Partial<AppModel> & { id: string; name: string; type: string; cwd: string; startCmd: string; env: Record<string, string> }) {
  return {
    id: app.id,
    name: app.name,
    type: app.type,
    cwd: app.cwd,
    startCmd: app.startCmd,
    env: app.env || {},
    status: app.status || 'stopped',
    pid: app.pid ?? null,
    startTime: app.startTime ?? null,
    stopTime: app.stopTime ?? null,
    exitCode: app.exitCode ?? null,
    signal: app.signal ?? null,
    error: app.error ?? null,
    restarts: app.restarts ?? 0,
    metricsSnapshot: app.metricsSnapshot ?? null,
    metricsHistory: Array.isArray(app.metricsHistory) ? app.metricsHistory.slice() : [],
    filesCount: app.filesCount ?? null,
    createdAt: app.createdAt ?? null,
    updatedAt: app.updatedAt ?? null,
    installState: app.installState ?? (app.isInstalling ? 'installing' : 'idle'),
    lastInstallAt: app.lastInstallAt ?? null,
    installMessage: app.installMessage ?? null,
    lastLogEntry: app.lastLogEntry ?? null,
    lastEvent: app.lastEvent ?? null,
    isInstalling: app.isInstalling ?? false,
    isWorking: app.isWorking ?? false
  } as AppModel;
}

function mergeStatus(target: AppModel, status: Partial<AppProcessStatus>): AppModel {
  return Object.assign(target, {
    status: status.status ?? target.status,
    pid: status.pid ?? target.pid,
    startTime: status.startTime ?? target.startTime,
    stopTime: status.stopTime ?? target.stopTime,
    exitCode: status.exitCode ?? target.exitCode,
    signal: status.signal ?? target.signal,
    error: status.error ?? target.error,
    restarts: status.restarts ?? target.restarts
  });
}

function pushMetrics(target: AppModel, snapshot: AppMetricsSnapshot) {
  const normalized = {
    timestamp: snapshot.timestamp,
    cpu: normalizeMetrics(snapshot.cpu),
    memory: normalizeMetrics(snapshot.memory)
  };
  target.metricsSnapshot = normalized;
  target.metricsHistory.push(normalized);
  if (target.metricsHistory.length > MAX_HISTORY_POINTS) {
    target.metricsHistory.splice(0, target.metricsHistory.length - MAX_HISTORY_POINTS);
  }
}

export const useAppsStore = defineStore('apps', {
  state: (): AppsState => ({
    apps: [],
    selectedAppId: null,
    order: [],
    isLoading: false,
    error: null,
    subscriptions: new Map(),
    reconnectAttempts: 0
  }),
  getters: {
    sortedApps(state): AppModel[] {
      if (state.order.length === 0) {
        return state.apps.slice();
      }
      const map = new Map(state.apps.map((app) => [app.id, app]));
      const ordered = state.order
        .map((id) => map.get(id))
        .filter((app): app is AppModel => Boolean(app));
      const remaining = state.apps.filter((app) => !state.order.includes(app.id));
      return ordered.concat(remaining);
    },
    getAppById(state) {
      return (id: string) => state.apps.find((app) => app.id === id) ?? null;
    }
  },
  actions: {
    setOrder(order: string[]) {
      this.order = order;
      localStorage.setItem('app-card-order', JSON.stringify(order));
    },
    loadOrder() {
      try {
        const raw = localStorage.getItem('app-card-order');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            this.order = parsed.filter((id: unknown): id is string => typeof id === 'string');
          }
        }
      } catch (error) {
        console.warn('Failed to load app card order', error);
      }
    },
    upsertApp(app: AppModel) {
      const existingIndex = this.apps.findIndex((item) => item.id === app.id);
      if (existingIndex === -1) {
        this.apps.push(app);
      } else {
        const updated = { ...this.apps[existingIndex], ...app };
        this.apps.splice(existingIndex, 1, updated);
      }
    },
    removeApp(id: string) {
      this.apps = this.apps.filter((app) => app.id !== id);
    },
    async fetchApps() {
      this.isLoading = true;
      this.error = null;
      try {
        const response = await apiClient.get('/api/apps');
        const apps = Array.isArray(response.data?.apps) ? response.data.apps : [];
        this.apps = apps.map((app: AppModel) => {
          const model = createAppModel(app);
          if (app.metricsSnapshot) {
            pushMetrics(model, {
              timestamp: app.metricsSnapshot?.timestamp ?? Date.now(),
              cpu: app.metricsSnapshot?.cpu ?? 0,
              memory: app.metricsSnapshot?.memory ?? 0
            });
          }
          return model;
        });
        if (this.order.length === 0) {
          this.order = this.apps.map((app) => app.id);
        }
        return this.apps;
      } catch (error: any) {
        this.error = error?.message ?? 'Failed to fetch apps';
        throw error;
      } finally {
        this.isLoading = false;
      }
    },
    attachWebSocket(client: WebSocketClient) {
      const offMessage = client.on('message', (message: any) => {
        if (!message || typeof message !== 'object') {
          return;
        }
        const { type, payload, appId } = message as { type?: string; payload?: any; appId?: string };
        switch (type) {
          case 'app.list':
            this.handleAppList(payload?.apps ?? []);
            break;
          case 'app.status':
            if (appId) {
              this.handleStatusUpdate(appId, payload?.status ?? {});
            }
            break;
          case 'app.metrics':
            if (appId) {
              this.handleMetricsUpdate(appId, payload);
            }
            break;
          case 'app.install':
            if (appId) {
              this.handleInstallUpdate(appId, payload ?? {});
            }
            break;
          case 'app.logs':
            if (appId) {
              this.handleLogEntry(appId, payload);
            }
            break;
          default:
            break;
        }
      });

      const offOpen = client.on('open', () => {
        this.reconnectAttempts = 0;
      });

      const offClose = client.on('close', () => {
        this.reconnectAttempts += 1;
      });

      return () => {
        offMessage();
        offOpen();
        offClose();
      };
    },
    handleAppList(apps: any[]) {
      const models = apps.map((app) => createAppModel(app));
      this.apps = models.map((model) => {
        const existing = this.apps.find((item) => item.id === model.id);
        if (existing) {
          model.metricsHistory = existing.metricsHistory.slice(-MAX_HISTORY_POINTS);
          if (!model.metricsSnapshot && existing.metricsSnapshot) {
            model.metricsSnapshot = existing.metricsSnapshot;
          }
          if (existing.installState && model.installState === 'idle' && existing.installState !== 'idle') {
            model.installState = existing.installState;
          }
          if (existing.isInstalling) {
            model.isInstalling = true;
          }
          if (!model.installMessage && existing.installMessage) {
            model.installMessage = existing.installMessage;
          }
          if (!model.lastInstallAt && existing.lastInstallAt) {
            model.lastInstallAt = existing.lastInstallAt;
          }
          model.lastLogEntry = existing.lastLogEntry;
          model.lastEvent = existing.lastEvent;
        }
        return model;
      });
      if (this.order.length === 0) {
        this.order = this.apps.map((app) => app.id);
      }
    },
    handleStatusUpdate(appId: string, status: Partial<AppProcessStatus> & { updatedAt?: number }) {
      const existing = this.apps.find((app) => app.id === appId);
      if (!existing) {
        const model = createAppModel({
          id: appId,
          name: appId,
          type: 'node',
          cwd: '',
          startCmd: '',
          env: {},
          status: status.status ?? 'stopped',
          pid: status.pid ?? null,
          startTime: status.startTime ?? null,
          stopTime: status.stopTime ?? null,
          exitCode: status.exitCode ?? null,
          signal: status.signal ?? null,
          error: status.error ?? null,
          restarts: status.restarts ?? 0
        });
        mergeStatus(model, status);
        model.updatedAt = status.updatedAt ?? Date.now();
        model.lastEvent = {
          type: 'status',
          message: status.error ?? status.status ?? model.status,
          timestamp: model.updatedAt
        };
        this.apps.push(model);
        return;
      }
      const previousStatus = existing.status;
      mergeStatus(existing, status);
      existing.isWorking = false;
      const updatedAt = status.updatedAt ?? (previousStatus !== existing.status || status.error ? Date.now() : existing.updatedAt ?? Date.now());
      existing.updatedAt = updatedAt;
      if (status.error) {
        existing.lastEvent = {
          type: 'status',
          message: status.error,
          timestamp: updatedAt
        };
      } else if (status.exitCode !== undefined && status.exitCode !== null) {
        existing.lastEvent = {
          type: 'status',
          message: `Exited with code ${status.exitCode}`,
          timestamp: updatedAt
        };
      } else if (status.status && previousStatus !== status.status) {
        existing.lastEvent = {
          type: 'status',
          message: status.status,
          timestamp: updatedAt
        };
      }
    },
    handleMetricsUpdate(appId: string, metrics: AppMetricsSnapshot | undefined) {
      if (!metrics) {
        return;
      }
      const existing = this.apps.find((app) => app.id === appId);
      if (!existing) {
        return;
      }
      pushMetrics(existing, {
        timestamp: metrics.timestamp ?? Date.now(),
        cpu: metrics.cpu ?? 0,
        memory: metrics.memory ?? 0
      });
    },
    handleInstallUpdate(appId: string, info: any) {
      const app = this.apps.find((item) => item.id === appId);
      if (!app) {
        return;
      }
      const status = typeof info?.status === 'string' ? info.status : '';
      const message = typeof info?.message === 'string' ? info.message : info?.error ?? null;
      const timestamp = typeof info?.timestamp === 'number' ? info.timestamp : Date.now();

      switch (status) {
        case 'started':
          app.installState = 'installing';
          app.isInstalling = true;
          app.lastInstallAt = timestamp;
          app.installMessage = message ?? 'Installing dependencies…';
          break;
        case 'progress':
          app.lastInstallAt = timestamp;
          if (message) {
            app.installMessage = message;
          }
          break;
        case 'completed':
          app.installState = 'success';
          app.isInstalling = false;
          app.lastInstallAt = timestamp;
          app.installMessage = message ?? 'Dependencies installed';
          app.lastEvent = {
            type: 'install',
            message: app.installMessage,
            timestamp
          };
          break;
        case 'failed':
          app.installState = 'error';
          app.isInstalling = false;
          app.lastInstallAt = timestamp;
          app.installMessage = message ?? 'Install failed';
          app.lastEvent = {
            type: 'install',
            message: app.installMessage,
            timestamp
          };
          if (typeof info?.exitCode === 'number') {
            app.exitCode = info.exitCode;
          }
          if (info?.signal !== undefined) {
            app.signal = info.signal ?? null;
          }
          break;
        default:
          break;
      }
      if (status === 'completed' || status === 'failed') {
        app.updatedAt = timestamp;
      }
    },
    handleLogEntry(appId: string, payload: any) {
      const app = this.apps.find((item) => item.id === appId);
      if (!app) {
        return;
      }
      if (payload?.reset) {
        app.lastLogEntry = null;
        return;
      }
      const lineSource = typeof payload?.line === 'string'
        ? payload.line
        : typeof payload === 'string'
          ? payload
          : payload?.message ?? '';
      const line = lineSource.length > 280 ? `${lineSource.slice(0, 277)}…` : lineSource;
      const entry: AppLogEntryModel = {
        timestamp: typeof payload?.timestamp === 'number' ? payload.timestamp : Date.now(),
        stream: typeof payload?.stream === 'string' ? payload.stream : 'stdout',
        line
      };
      app.lastLogEntry = entry;
      if (entry.stream === 'stderr') {
        app.lastEvent = {
          type: 'log',
          message: entry.line,
          timestamp: entry.timestamp
        };
      }
    },
    async startApp(appId: string) {
      const app = this.apps.find((item) => item.id === appId);
      if (!app) {
        return;
      }
      app.isWorking = true;
      try {
        await apiClient.post(`/api/apps/${appId}/start`);
      } catch (error) {
        app.isWorking = false;
        throw error;
      }
    },
    async stopApp(appId: string) {
      const app = this.apps.find((item) => item.id === appId);
      if (!app) {
        return;
      }
      app.isWorking = true;
      try {
        await apiClient.post(`/api/apps/${appId}/stop`);
      } catch (error) {
        app.isWorking = false;
        throw error;
      }
    },
    async restartApp(appId: string) {
      const app = this.apps.find((item) => item.id === appId);
      if (!app) {
        return;
      }
      app.isWorking = true;
      try {
        await apiClient.post(`/api/apps/${appId}/restart`);
      } catch (error) {
        app.isWorking = false;
        throw error;
      }
    },
    async deleteApp(appId: string) {
      try {
        await apiClient.delete(`/api/apps/${appId}`);
        this.removeApp(appId);
      } catch (error) {
        throw error;
      }
    },
    async installApp(appId: string, payload: Record<string, unknown> = {}) {
      const app = this.apps.find((item) => item.id === appId);
      if (!app) {
        return;
      }
      app.isInstalling = true;
      app.installState = 'installing';
      app.installMessage = 'Installing dependencies…';
      app.lastInstallAt = Date.now();
      try {
        await apiClient.post(`/api/apps/${appId}/install`, payload);
        app.isInstalling = false;
        const completedAt = Date.now();
        app.lastInstallAt = completedAt;
        if (app.installState === 'installing') {
          app.installState = 'success';
          app.installMessage = app.installMessage ?? 'Dependencies installed';
          app.lastEvent = {
            type: 'install',
            message: app.installMessage,
            timestamp: completedAt
          };
        }
      } catch (error: any) {
        app.isInstalling = false;
        const failedAt = Date.now();
        app.lastInstallAt = failedAt;
        app.installState = 'error';
        app.installMessage = error?.response?.data?.error ?? error?.message ?? 'Install failed';
        app.lastEvent = {
          type: 'install',
          message: app.installMessage,
          timestamp: failedAt
        };
        throw error;
      }
    }
  }
});
