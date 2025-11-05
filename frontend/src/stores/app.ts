import { defineStore } from 'pinia';

export type HealthStatus = 'unknown' | 'online' | 'offline';
export type EventStreamStatus = 'connecting' | 'connected' | 'disconnected';

export interface ActivityEvent<T = unknown> {
  type: string;
  payload?: T;
  receivedAt: number;
}

export const useAppStore = defineStore('app', {
  state: () => ({
    healthStatus: 'unknown' as HealthStatus,
    eventStreamStatus: 'connecting' as EventStreamStatus,
    lastHealthCheck: 0,
    events: [] as ActivityEvent[]
  }),
  actions: {
    setHealthStatus(status: HealthStatus) {
      this.healthStatus = status;
      this.lastHealthCheck = Date.now();
    },
    setEventStreamStatus(status: EventStreamStatus) {
      this.eventStreamStatus = status;
    },
    pushEvent(event: ActivityEvent) {
      this.events.unshift(event);
      if (this.events.length > 20) {
        this.events.pop();
      }
    }
  },
  getters: {
    isBackendHealthy: (state) => state.healthStatus === 'online',
    isEventStreamConnected: (state) => state.eventStreamStatus === 'connected'
  }
});
