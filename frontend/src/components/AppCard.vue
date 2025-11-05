<template>
  <el-card
    class="app-card"
    shadow="hover"
    :class="cardClasses"
    @dblclick="onDoubleClick"
    @auxclick.prevent="onAuxClick"
  >
    <div class="card-header">
      <div class="card-title">
        <span class="dot" :class="indicatorClass" />
        <div class="titles">
          <div class="titles__row">
            <h3>{{ app.name }}</h3>
            <el-tag :type="statusTagType" round size="small" class="status-tag">
              {{ statusLabel }}
            </el-tag>
          </div>
          <div class="titles__meta">
            <span class="app-type">{{ typeLabel }}</span>
            <span v-if="app.restarts" class="restarts">
              {{ app.restarts }} restart<span v-if="app.restarts !== 1">s</span>
            </span>
          </div>
        </div>
      </div>
      <div class="controls">
        <el-tooltip content="Start" placement="top">
          <el-button
            size="small"
            type="success"
            circle
            :icon="StartIcon"
            :loading="isActionLoading()"
            :disabled="!canStart"
            @click.stop="emitAction('start')"
          />
        </el-tooltip>
        <el-tooltip content="Stop" placement="top">
          <el-button
            size="small"
            type="danger"
            circle
            :icon="StopIcon"
            :loading="isActionLoading()"
            :disabled="!canStop"
            @click.stop="emitAction('stop')"
          />
        </el-tooltip>
        <el-tooltip content="Restart" placement="top">
          <el-button
            size="small"
            type="primary"
            circle
            :icon="RefreshIcon"
            :loading="isActionLoading()"
            :disabled="!canRestart"
            @click.stop="emitAction('restart')"
          />
        </el-tooltip>
        <el-dropdown trigger="click" @command="handleCommand">
          <el-button size="small" circle type="info" :icon="MoreIcon" />
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="install">Install dependencies</el-dropdown-item>
              <el-dropdown-item command="delete" divided class="danger">Delete app</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>

    <div class="card-body">
      <div class="status-line">
        <span v-if="app.pid" class="pid">PID {{ app.pid }}</span>
        <el-tag
          v-if="showInstallState"
          :type="installTagType"
          size="small"
          effect="dark"
          class="install-tag"
        >
          <el-icon v-if="app.installState === 'installing'" class="install-icon spin"><LoadingIcon /></el-icon>
          <el-icon v-else-if="app.installState === 'success'" class="install-icon success"><SuccessIcon /></el-icon>
          <el-icon v-else class="install-icon warning"><WarningIcon /></el-icon>
          <span>{{ installStatusLabel }}</span>
        </el-tag>
        <span v-if="updatedLabel" class="updated">Updated {{ updatedLabel }}</span>
      </div>

      <div class="metrics">
        <div class="metric">
          <span class="label">CPU</span>
          <span class="value">{{ formattedCpu }}%</span>
        </div>
        <div class="metric">
          <span class="label">Memory</span>
          <span class="value">{{ formattedMemory }} MB</span>
        </div>
        <div class="metric">
          <span class="label">Files</span>
          <span class="value">{{ formattedFilesCount }}</span>
        </div>
      </div>

      <div class="command-row">
        <span class="label">Start command</span>
        <code class="command">{{ app.startCmd || '—' }}</code>
      </div>

      <div v-if="eventMessage" class="event-row" :class="{ 'event-row--error': eventIsError }">
        <el-tooltip v-if="eventTooltip" :content="eventTooltip">
          <span class="event-text">{{ eventMessage }}</span>
        </el-tooltip>
        <span v-else class="event-text">{{ eventMessage }}</span>
      </div>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ElMessageBox } from 'element-plus';
import { useAppsStore, type AppModel } from '@/stores/apps';
import { Plus, VideoPause, RefreshLeft, MoreFilled, Loading, CircleCheckFilled, WarningFilled } from '@element-plus/icons-vue';

const props = defineProps<{ app: AppModel }>();

const emit = defineEmits(['open-file', 'open-console', 'action', 'command']);

const appsStore = useAppsStore();

const StartIcon = Plus;
const StopIcon = VideoPause;
const RefreshIcon = RefreshLeft;
const MoreIcon = MoreFilled;
const LoadingIcon = Loading;
const SuccessIcon = CircleCheckFilled;
const WarningIcon = WarningFilled;

const cardClasses = computed(() => ({
  'is-running': props.app.status === 'running',
  'is-error': props.app.status === 'error' || props.app.status === 'crashed',
  'is-starting': props.app.status === 'starting',
  'has-install-state': props.app.installState !== 'idle'
}));

const indicatorClass = computed(() => ({
  running: props.app.status === 'running',
  error: props.app.status === 'error' || props.app.status === 'crashed',
  starting: props.app.status === 'starting'
}));

const statusTagType = computed(() => {
  switch (props.app.status) {
    case 'running':
      return 'success';
    case 'error':
    case 'crashed':
      return 'danger';
    case 'starting':
      return 'warning';
    default:
      return 'info';
  }
});

const statusLabel = computed(() => {
  switch (props.app.status) {
    case 'running':
      return 'Running';
    case 'starting':
      return 'Starting';
    case 'stopped':
      return 'Stopped';
    case 'error':
    case 'crashed':
      return 'Error';
    default:
      return props.app.status ?? 'Unknown';
  }
});

const typeLabel = computed(() => props.app.type?.toUpperCase() ?? 'APP');

const formattedCpu = computed(() => {
  const value = props.app.metricsSnapshot?.cpu ?? 0;
  return value.toFixed(1);
});

const formattedMemory = computed(() => {
  const value = props.app.metricsSnapshot?.memory ?? 0;
  return value.toFixed(0);
});

const formattedFilesCount = computed(() => {
  if (props.app.filesCount === null || props.app.filesCount === undefined) {
    return '—';
  }
  return props.app.filesCount.toLocaleString();
});

function formatRelativeTime(timestamp: number) {
  const now = Date.now();
  const diff = now - timestamp;
  if (diff < 5000) {
    return 'just now';
  }
  if (diff < 60000) {
    const seconds = Math.round(diff / 1000);
    return `${seconds}s ago`;
  }
  if (diff < 3600000) {
    const minutes = Math.round(diff / 60000);
    return `${minutes}m ago`;
  }
  if (diff < 86400000) {
    const hours = Math.round(diff / 3600000);
    return `${hours}h ago`;
  }
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const updatedLabel = computed(() => {
  if (!props.app.updatedAt) {
    return '';
  }
  return formatRelativeTime(props.app.updatedAt);
});

const showInstallState = computed(() => props.app.installState !== 'idle');

const installTagType = computed(() => {
  switch (props.app.installState) {
    case 'installing':
      return 'warning';
    case 'success':
      return 'success';
    case 'error':
      return 'danger';
    default:
      return 'info';
  }
});

const installStatusLabel = computed(() => {
  switch (props.app.installState) {
    case 'installing':
      return props.app.installMessage ?? 'Installing…';
    case 'success':
      return props.app.installMessage ?? 'Installed';
    case 'error':
      return props.app.installMessage ?? 'Install failed';
    default:
      return '';
  }
});

const eventMessage = computed(() => {
  let message = '';
  if (props.app.status === 'error' || props.app.status === 'crashed') {
    message = props.app.error || props.app.lastLogEntry?.line || '';
  } else if (props.app.installState === 'error') {
    message = props.app.installMessage ?? '';
  } else if (props.app.lastEvent?.message) {
    message = props.app.lastEvent.message;
  } else if (props.app.installState === 'success' && props.app.installMessage) {
    message = props.app.installMessage;
  }
  if (!message) {
    return '';
  }
  const normalized = message.replace(/\s+/g, ' ').trim();
  return normalized.length > 160 ? `${normalized.slice(0, 157)}…` : normalized;
});

const eventTooltip = computed(() => {
  const parts: string[] = [];
  if (typeof props.app.exitCode === 'number') {
    parts.push(`Exit code: ${props.app.exitCode}`);
  }
  if (props.app.signal) {
    parts.push(`Signal: ${props.app.signal}`);
  }
  if (parts.length > 0) {
    return parts.join(' · ');
  }
  return '';
});

const eventIsError = computed(() => {
  if (props.app.status === 'error' || props.app.status === 'crashed') {
    return true;
  }
  if (props.app.installState === 'error') {
    return true;
  }
  return props.app.lastEvent?.type === 'log' && props.app.lastLogEntry?.stream === 'stderr';
});

const canStart = computed(() => ['stopped', 'error', 'crashed'].includes(props.app.status));
const canStop = computed(() => props.app.status === 'running');
const canRestart = computed(() => props.app.status === 'running');

const isActionLoading = () => props.app.isWorking;

const onDoubleClick = () => {
  emit('open-file', props.app.id);
};

const onAuxClick = (event: MouseEvent) => {
  if (event.button === 1) {
    emit('open-console', props.app.id);
  }
};

const emitAction = (action: 'start' | 'stop' | 'restart') => {
  emit('action', { action, id: props.app.id });
};

const handleCommand = (command: string) => {
  if (command === 'delete') {
    ElMessageBox.confirm(
      `Delete app "${props.app.name}"?`,
      'Delete app',
      {
        confirmButtonText: 'Delete',
        cancelButtonText: 'Cancel',
        type: 'warning'
      }
    )
      .then(async () => {
        try {
          await appsStore.deleteApp(props.app.id);
        } catch (error) {
          console.error(error);
        }
      })
      .catch(() => {});
  } else if (command === 'install') {
    emit('command', { command, id: props.app.id });
  }
};
</script>

<style scoped>
.app-card {
  border-radius: 1.25rem;
  border: 1px solid var(--border-subtle);
  background: rgba(15, 23, 42, 0.9);
  color: var(--text-muted);
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.3s ease;
  cursor: grab;
}

.app-card:active {
  cursor: grabbing;
}

.app-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.35);
}

.app-card.is-running {
  border-color: rgba(34, 197, 94, 0.35);
}

.app-card.is-error {
  border-color: rgba(248, 113, 113, 0.4);
}

.app-card.is-starting {
  border-color: rgba(250, 204, 21, 0.35);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
}

.card-title {
  display: flex;
  align-items: center;
  gap: 0.85rem;
}

.dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--border-subtle);
  box-shadow: 0 0 8px rgba(148, 163, 184, 0.3);
  transition: all 0.3s ease;
}

.dot.running {
  background: var(--success);
  box-shadow: 0 0 12px rgba(34, 197, 94, 0.7);
}

.dot.error {
  background: var(--danger);
  box-shadow: 0 0 12px rgba(248, 113, 113, 0.65);
}

.dot.starting {
  background: var(--warning);
  box-shadow: 0 0 12px rgba(250, 204, 21, 0.6);
}

.titles {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.titles__row {
  display: flex;
  align-items: center;
  gap: 0.65rem;
}

.titles__row h3 {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--text-emphasis);
}

.status-tag {
  letter-spacing: 0.02em;
}

.titles__meta {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.85rem;
}

.app-type {
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(148, 163, 184, 0.85);
}

.restarts {
  color: var(--warning);
}

.controls {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

:deep(.el-dropdown-menu__item.danger) {
  color: var(--danger-strong);
}

.card-body {
  display: flex;
  flex-direction: column;
  gap: 1.15rem;
}

.status-line {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
  font-size: 0.85rem;
}

.pid {
  color: rgba(148, 163, 184, 0.85);
}

.install-tag {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  border-radius: 999px;
}

.install-icon {
  font-size: 0.9rem;
}

.install-icon.spin {
  animation: spin 1s linear infinite;
}

.updated {
  color: rgba(148, 163, 184, 0.75);
  margin-left: auto;
}

.metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: 0.85rem;
}

.metric {
  background: rgba(30, 41, 59, 0.65);
  padding: 0.85rem;
  border-radius: 0.9rem;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.metric .label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(148, 163, 184, 0.7);
}

.metric .value {
  font-size: 1.15rem;
  font-weight: 600;
  color: var(--text-emphasis);
}

.command-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
  font-size: 0.9rem;
}

.command-row .label {
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: 0.75rem;
  color: rgba(148, 163, 184, 0.7);
}

.command-row .command {
  font-size: 0.9rem;
}

.event-row {
  padding: 0.85rem;
  border-radius: 0.9rem;
  background: rgba(59, 130, 246, 0.08);
  border: 1px solid rgba(59, 130, 246, 0.15);
  color: rgba(191, 219, 254, 0.9);
  font-size: 0.9rem;
  line-height: 1.4;
}

.event-row--error {
  background: rgba(248, 113, 113, 0.08);
  border-color: rgba(248, 113, 113, 0.25);
  color: rgba(254, 202, 202, 0.95);
}

.event-text {
  display: inline-block;
  max-width: 100%;
  word-break: break-word;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 640px) {
  .card-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 1rem;
  }

  .controls {
    width: 100%;
  }

  .updated {
    margin-left: 0;
  }
}
</style>
