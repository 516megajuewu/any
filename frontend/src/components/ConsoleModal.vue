<template>
  <el-dialog
    :model-value="isOpen"
    :title="dialogTitle"
    width="70%"
    top="5vh"
    @close="close"
  >
    <div class="console-container">
      <div class="console-output">
        <p v-if="logs.length === 0" class="placeholder">
          No logs yet. Logs will appear here once the app starts.
        </p>
        <div v-for="(log, idx) in logs" :key="idx" class="log-entry" :class="log.stream">
          <span class="log-time">{{ formatTime(log.timestamp) }}</span>
          <span class="log-text">{{ log.line }}</span>
        </div>
      </div>
      <div class="console-hint">
        <small>
          PTY support and input will be enabled in a future update.
        </small>
      </div>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, watch, ref, inject, withDefaults, onBeforeUnmount } from 'vue';
import type { WebSocketClient } from '@/stores/apps';

const props = withDefaults(defineProps<{
  isOpen: boolean;
  appId?: string;
  appName?: string;
}>(), {
  isOpen: false,
  appName: 'App'
});

const emit = defineEmits(['close']);

interface LogEntry {
  timestamp: number;
  stream: string;
  line: string;
}

const logs = ref<LogEntry[]>([]);

const eventsClient = inject<WebSocketClient>('eventsClient');

const dialogTitle = computed(() => {
  return props.appName ? `Console – ${props.appName}` : 'Console';
});

const formatTime = (timestamp: number) => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString(undefined, { hour12: false });
};

let unsubscribe: (() => void) | null = null;

const cleanup = () => {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
};

const subscribeToLogs = () => {
  cleanup();
  if (!props.appId || !eventsClient) {
    return;
  }

  unsubscribe = eventsClient.on('message', (message: any) => {
    if (!message || typeof message !== 'object') {
      return;
    }
    const { type, appId, payload } = message as { type?: string; appId?: string; payload?: any };
    if (type === 'app.logs' && appId === props.appId && payload) {
      logs.value.push({
        timestamp: payload.timestamp ?? Date.now(),
        stream: payload.stream ?? 'stdout',
        line: payload.line ?? String(payload)
      });
      if (logs.value.length > 500) {
        logs.value.splice(0, logs.value.length - 500);
      }
    }
  });
};

watch(
  () => [props.isOpen, props.appId],
  ([isOpen, appId]) => {
    if (isOpen && appId) {
      logs.value = [];
      subscribeToLogs();
    } else {
      cleanup();
    }
  },
  { immediate: true }
);

const close = () => {
  cleanup();
  emit('close');
};

onBeforeUnmount(() => {
  cleanup();
});
</script>

<style scoped>
.console-container {
  display: flex;
  flex-direction: column;
  height: 60vh;
}

.console-output {
  flex: 1;
  overflow-y: auto;
  background: rgba(15, 23, 42, 0.95);
  border: 1px solid var(--border-subtle);
  border-radius: 0.75rem;
  padding: 1rem;
  font-family: 'Courier New', monospace;
  font-size: 0.9rem;
  line-height: 1.5;
  color: var(--text-muted);
}

.placeholder {
  color: var(--text-muted);
}

.log-entry {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 0.25rem;
}

.log-entry.stderr {
  color: rgba(252, 165, 165, 1);
}

.log-time {
  color: rgba(148, 163, 184, 0.8);
  flex-shrink: 0;
}

.log-text {
  word-break: break-word;
}

.console-hint {
  margin-top: 1rem;
  color: var(--text-muted);
  text-align: center;
}
</style>
