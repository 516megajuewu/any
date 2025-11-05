<template>
  <el-card
    class="app-card"
    shadow="hover"
    :class="statusClass"
    @dblclick="onDoubleClick"
    @auxclick.prevent="onAuxClick"
  >
    <div class="card-header">
      <div class="app-title">
        <span class="dot" :class="indicatorClass" />
        <div class="titles">
          <h3>{{ app.name }}</h3>
          <small class="app-type">{{ app.type.toUpperCase() }}</small>
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
        <el-tag :type="statusTagType" round size="small">{{ statusLabel }}</el-tag>
        <span v-if="app.pid" class="pid">PID {{ app.pid }}</span>
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
        <div v-if="app.restarts" class="metric restarts">
          <span class="label">Restarts</span>
          <span class="value">{{ app.restarts }}</span>
        </div>
      </div>

      <div v-if="app.error" class="error">
        {{ app.error }}
      </div>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ElMessageBox } from 'element-plus';
import { useAppsStore, type AppModel } from '@/stores/apps';
import { Plus, VideoPause, RefreshLeft, MoreFilled } from '@element-plus/icons-vue';

const props = defineProps<{ app: AppModel }>();

const emit = defineEmits(['open-file', 'open-console', 'action', 'command']);

const appsStore = useAppsStore();

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

const statusClass = computed(() => ({
  'is-running': props.app.status === 'running',
  'is-error': props.app.status === 'error' || props.app.status === 'crashed',
  'is-starting': props.app.status === 'starting'
}));

const indicatorClass = computed(() => ({
  running: props.app.status === 'running',
  error: props.app.status === 'error' || props.app.status === 'crashed',
  starting: props.app.status === 'starting'
}));

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

const formattedCpu = computed(() => {
  const value = props.app.metricsSnapshot?.cpu ?? 0;
  return value.toFixed(1);
});

const formattedMemory = computed(() => {
  const value = props.app.metricsSnapshot?.memory ?? 0;
  return value.toFixed(0);
});

const canStart = computed(() => ['stopped', 'error', 'crashed'].includes(props.app.status));
const canStop = computed(() => props.app.status === 'running');
const canRestart = computed(() => props.app.status === 'running');

const StartIcon = Plus;
const StopIcon = VideoPause;
const RefreshIcon = RefreshLeft;
const MoreIcon = MoreFilled;

const isActionLoading = () => {
  return props.app.isWorking;
};

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
    ).then(async () => {
      try {
        await appsStore.deleteApp(props.app.id);
      } catch (error) {
        console.error(error);
      }
    });
  } else if (command === 'install') {
    emit('command', { command, id: props.app.id });
  }
};
</script>

<style scoped>
.app-card {
  border-radius: 1.25rem;
  border: 1px solid var(--border-subtle);
  background: rgba(15, 23, 42, 0.85);
  color: var(--text-muted);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
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
  border-color: rgba(34, 197, 94, 0.3);
}

.app-card.is-error {
  border-color: rgba(248, 113, 113, 0.4);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
}

.app-title {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--border-subtle);
  box-shadow: 0 0 12px rgba(148, 163, 184, 0.2);
  transition: all 0.3s ease;
}

.dot.running {
  background: var(--success);
  box-shadow: 0 0 12px rgba(34, 197, 94, 0.8);
}

.dot.error {
  background: var(--danger);
  box-shadow: 0 0 12px rgba(248, 113, 113, 0.7);
}

.dot.starting {
  background: var(--warning);
  box-shadow: 0 0 12px rgba(250, 204, 21, 0.6);
}

.titles h3 {
  margin: 0;
  font-size: 1rem;
  color: var(--text-emphasis);
}

.titles small {
  color: var(--text-muted);
}

.controls {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

:deep(.el-dropdown-menu__item.danger) {
  color: var(--danger-strong);
}

.status-line {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.pid {
  font-size: 0.85rem;
  color: var(--text-muted);
}

.metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: 0.75rem;
}

.metric {
  background: rgba(30, 41, 59, 0.65);
  padding: 0.75rem;
  border-radius: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.metric .label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
}

.metric .value {
  font-size: 1.1rem;
  color: var(--text-emphasis);
}

.metric.restarts .value {
  color: var(--warning);
}

.error {
  margin-top: 1rem;
  padding: 0.75rem;
  border-radius: 0.75rem;
  background: rgba(248, 113, 113, 0.1);
  border: 1px solid rgba(248, 113, 113, 0.25);
  color: rgba(254, 242, 242, 1);
  font-size: 0.9rem;
}
</style>
