<template>
  <div class="dashboard-view">
    <el-row :gutter="16" class="dashboard-grid">
      <el-col :xs="24" :md="12" :xl="8">
        <el-card shadow="hover" class="status-card">
          <template #header>
            <div class="card-header">
              <span>Backend status</span>
              <el-tag :type="healthTagType" round>{{ healthLabel }}</el-tag>
            </div>
          </template>
          <p class="status-value">{{ healthLabel }}</p>
          <p class="status-sub">Last check • {{ lastChecked }}</p>
        </el-card>
      </el-col>

      <el-col :xs="24" :md="12" :xl="8">
        <el-card shadow="hover" class="status-card">
          <template #header>
            <div class="card-header">
              <span>Event stream</span>
              <el-tag :type="streamTagType" round>{{ streamLabel }}</el-tag>
            </div>
          </template>
          <p class="status-value">{{ streamLabel }}</p>
          <p class="status-sub">Live system events broadcast from the backend.</p>
        </el-card>
      </el-col>

      <el-col :xs="24" :md="12" :xl="8">
        <el-card shadow="hover" class="status-card">
          <template #header>
            <div class="card-header">
              <span>Packages</span>
              <el-tag round>npm / pip</el-tag>
            </div>
          </template>
          <p class="status-value">Managers ready</p>
          <p class="status-sub">Use the package manager stubs to install runtime dependencies.</p>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="16" class="dashboard-grid">
      <el-col :xs="24" :lg="12">
        <el-card shadow="never" class="event-card">
          <template #header>
            <div class="card-header">
              <span>Recent events</span>
              <el-tag v-if="events.length === 0" type="info" effect="light">Waiting for events</el-tag>
            </div>
          </template>
          <el-timeline>
            <el-timeline-item
              v-for="event in events"
              :key="event.receivedAt"
              :timestamp="formatTimestamp(event.receivedAt)"
              placement="top"
              :type="timelineType(event.type)"
            >
              <div class="event-item">
                <strong>{{ event.type }}</strong>
                <pre v-if="event.payload" class="event-payload">{{ formattedPayload(event.payload) }}</pre>
              </div>
            </el-timeline-item>
          </el-timeline>
        </el-card>
      </el-col>

      <el-col :xs="24" :lg="12">
        <el-card shadow="never" class="placeholder-card">
          <template #header>
            <div class="card-header">
              <span>Next steps</span>
            </div>
          </template>
          <ul class="next-steps">
            <li>Create an app runner inside <code>apps/</code>.</li>
            <li>Extend the API routes in <code>index.js</code>.</li>
            <li>Build UI modules inside the Vue Router views.</li>
          </ul>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useAppStore } from '@/stores/app';

const store = useAppStore();

const healthLabel = computed(() => {
  switch (store.healthStatus) {
    case 'online':
      return 'Online';
    case 'offline':
      return 'Offline';
    default:
      return 'Unknown';
  }
});

const healthTagType = computed(() => {
  switch (store.healthStatus) {
    case 'online':
      return 'success';
    case 'offline':
      return 'danger';
    default:
      return 'info';
  }
});

const streamLabel = computed(() => {
  switch (store.eventStreamStatus) {
    case 'connected':
      return 'Connected';
    case 'disconnected':
      return 'Disconnected';
    default:
      return 'Connecting';
  }
});

const streamTagType = computed(() => {
  switch (store.eventStreamStatus) {
    case 'connected':
      return 'success';
    case 'disconnected':
      return 'danger';
    default:
      return 'warning';
  }
});

const lastChecked = computed(() => {
  if (!store.lastHealthCheck) {
    return 'never';
  }
  return formatRelative(store.lastHealthCheck);
});

const events = computed(() => store.events);

const formatTimestamp = (timestamp: number) => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString(undefined, { hour12: false });
};

const formattedPayload = (payload: unknown) => {
  try {
    return JSON.stringify(payload, null, 2);
  } catch (error) {
    return String(payload);
  }
};

const timelineType = (type: string) => {
  if (type.includes('reload')) {
    return 'success';
  }
  if (type.includes('error')) {
    return 'danger';
  }
  return 'info';
};

function formatRelative(timestamp: number) {
  const seconds = Math.round((Date.now() - timestamp) / 1000);
  if (seconds < 5) {
    return 'just now';
  }
  if (seconds < 60) {
    return `${seconds}s ago`;
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}
</script>

<style scoped>
.dashboard-view {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.dashboard-grid {
  margin-bottom: 0.5rem;
}

.status-card {
  border-radius: 1rem;
  background: var(--surface);
  color: var(--text-muted);
}

.status-card :deep(.el-card__header) {
  border-bottom: none;
  background: transparent;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: var(--text-emphasis);
}

.status-value {
  font-size: 1.75rem;
  font-weight: 600;
  color: var(--text-emphasis);
  margin-bottom: 0.5rem;
}

.status-sub {
  color: var(--text-muted);
  margin: 0;
}

.event-card,
.placeholder-card {
  border-radius: 1rem;
  background: var(--surface);
}

.event-item {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.event-payload {
  margin: 0;
  background: rgba(15, 23, 42, 0.8);
  color: var(--text-muted);
  padding: 0.75rem;
  border-radius: 0.5rem;
  overflow: auto;
}

.next-steps {
  margin: 0;
  padding-left: 1.25rem;
  color: var(--text-muted);
}

.next-steps li {
  margin-bottom: 0.5rem;
}
</style>
