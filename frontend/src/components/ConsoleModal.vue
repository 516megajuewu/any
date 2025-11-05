<template>
  <el-dialog
    :model-value="isOpen"
    :title="dialogTitle"
    :width="modalWidth"
    :top="modalTop"
    @close="close"
    class="console-dialog"
  >
    <div class="console-container" ref="containerRef">
      <div class="console-toolbar">
        <div class="console-info">
          <span v-if="sessionId" class="session-badge">{{ sessionId.slice(0, 8) }}</span>
          <span v-if="shell" class="shell-badge">{{ shell }}</span>
        </div>
        <div class="console-actions">
          <button @click="clearTerminal" class="btn-icon" title="Clear">
            <span>🗑️</span>
          </button>
          <button @click="sendCtrlC" class="btn-icon" title="Ctrl+C">
            <span>⛔</span>
          </button>
        </div>
      </div>
      <div ref="terminalRef" class="terminal-wrapper"></div>
      <div v-if="!sessionId && !connecting" class="console-placeholder">
        <p>Click "Open Console" to start a PTY session</p>
        <button @click="openConsole" class="btn-open">Open Console</button>
      </div>
      <div v-if="connecting" class="console-placeholder">
        <p>Connecting...</p>
      </div>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, nextTick, inject } from 'vue';
import { computed } from 'vue';
import type { WebSocketClient } from '@/stores/apps';
import { ElMessage } from 'element-plus';

const props = withDefaults(defineProps<{
  isOpen: boolean;
  appId?: string;
  appName?: string;
}>(), {
  isOpen: false,
  appName: 'App'
});

const emit = defineEmits(['close']);

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const eventsClient = inject<WebSocketClient>('eventsClient');

const containerRef = ref<HTMLElement>();
const terminalRef = ref<HTMLElement>();
const sessionId = ref<string | null>(null);
const shell = ref<string | null>(null);
const connecting = ref(false);
const modalWidth = ref('70%');
const modalTop = ref('5vh');

let terminal: any = null;
let fitAddon: any = null;
let unsubscribe: (() => void) | null = null;

const dialogTitle = computed(() => {
  return props.appName ? `Console – ${props.appName}` : 'Console';
});

async function loadXterm() {
  if (terminal) return;

  try {
    const { Terminal } = await import('@xterm/xterm');
    const { FitAddon } = await import('@xterm/addon-fit');
    
    terminal = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Courier New, monospace',
      theme: {
        background: '#0f172a',
        foreground: '#e2e8f0',
        cursor: '#3b82f6',
        black: '#0f172a',
        red: '#f87171',
        green: '#34d399',
        yellow: '#fbbf24',
        blue: '#60a5fa',
        magenta: '#c084fc',
        cyan: '#22d3ee',
        white: '#e2e8f0',
        brightBlack: '#475569',
        brightRed: '#fca5a5',
        brightGreen: '#6ee7b7',
        brightYellow: '#fde047',
        brightBlue: '#93c5fd',
        brightMagenta: '#d8b4fe',
        brightCyan: '#67e8f9',
        brightWhite: '#f8fafc'
      },
      allowProposedApi: true
    });

    fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    if (terminalRef.value) {
      terminal.open(terminalRef.value);
      fitAddon.fit();
      
      terminal.onData((data: string) => {
        if (sessionId.value && eventsClient) {
          eventsClient.send({
            type: 'console:input',
            sessionId: sessionId.value,
            data
          });
        }
      });

      terminal.onResize(({ cols, rows }: { cols: number; rows: number }) => {
        if (sessionId.value && eventsClient) {
          eventsClient.send({
            type: 'console:resize',
            sessionId: sessionId.value,
            cols,
            rows
          });
        }
      });
    }
  } catch (error) {
    console.error('Failed to load xterm:', error);
    ElMessage.error('Failed to load terminal. Please install xterm dependencies.');
  }
}

async function openConsole() {
  if (!props.appId) {
    ElMessage.error('No app selected');
    return;
  }

  connecting.value = true;
  try {
    const response = await fetch(`${API_URL}/api/apps/${props.appId}/console`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cols: terminal?.cols || 80,
        rows: terminal?.rows || 24
      })
    });

    if (!response.ok) {
      throw new Error('Failed to create console session');
    }

    const data = await response.json();
    sessionId.value = data.sessionId;
    shell.value = data.shell;
    
    subscribeToConsole();
    ElMessage.success('Console session started');
  } catch (error: any) {
    ElMessage.error(error.message || 'Failed to open console');
  } finally {
    connecting.value = false;
  }
}

function subscribeToConsole() {
  cleanup();
  if (!sessionId.value || !eventsClient) {
    return;
  }

  eventsClient.send({
    type: 'subscribe',
    channel: `console:${sessionId.value}`
  });

  unsubscribe = eventsClient.on('message', (message: any) => {
    if (!message || typeof message !== 'object') {
      return;
    }

    const { type, data: outputData, reason } = message;

    if (type === 'console:data' && message.sessionId === sessionId.value) {
      if (terminal && outputData) {
        terminal.write(outputData);
      }
    }

    if (type === 'console:terminated' && message.sessionId === sessionId.value) {
      if (terminal) {
        terminal.write(`\r\n\n[Console terminated: ${reason || 'unknown'}]\r\n`);
      }
      sessionId.value = null;
      shell.value = null;
    }
  });
}

function clearTerminal() {
  if (terminal) {
    terminal.clear();
  }
}

function sendCtrlC() {
  if (sessionId.value && eventsClient) {
    eventsClient.send({
      type: 'console:input',
      sessionId: sessionId.value,
      data: '\x03'
    });
  }
}

async function closeConsole() {
  if (sessionId.value) {
    try {
      await fetch(`${API_URL}/api/console/${sessionId.value}`, {
        method: 'DELETE'
      });
    } catch (error) {
      console.error('Failed to close console:', error);
    }
    sessionId.value = null;
    shell.value = null;
  }
}

function cleanup() {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
}

const close = async () => {
  await closeConsole();
  cleanup();
  emit('close');
};

watch(
  () => props.isOpen,
  async (isOpen) => {
    if (isOpen) {
      await nextTick();
      await loadXterm();
      if (fitAddon) {
        setTimeout(() => fitAddon.fit(), 100);
      }
    } else {
      await closeConsole();
      cleanup();
      if (terminal) {
        terminal.clear();
      }
    }
  }
);

onMounted(async () => {
  if (props.isOpen) {
    await nextTick();
    await loadXterm();
  }
});

onBeforeUnmount(async () => {
  await closeConsole();
  cleanup();
  if (terminal) {
    terminal.dispose();
    terminal = null;
  }
});
</script>

<style>
@import '@xterm/xterm/css/xterm.css';
</style>

<style scoped>
.console-dialog :deep(.el-dialog__body) {
  padding: 0;
}

.console-container {
  display: flex;
  flex-direction: column;
  height: 60vh;
  background: #0f172a;
  border-radius: 0.5rem;
  overflow: hidden;
}

.console-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  background: rgba(30, 41, 59, 0.8);
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
}

.console-info {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.session-badge,
.shell-badge {
  padding: 0.25rem 0.625rem;
  background: rgba(59, 130, 246, 0.15);
  color: #60a5fa;
  font-size: 0.75rem;
  font-family: monospace;
  border-radius: 0.375rem;
  border: 1px solid rgba(59, 130, 246, 0.3);
}

.shell-badge {
  background: rgba(34, 197, 94, 0.15);
  color: #34d399;
  border-color: rgba(34, 197, 94, 0.3);
}

.console-actions {
  display: flex;
  gap: 0.5rem;
}

.btn-icon {
  padding: 0.375rem 0.625rem;
  background: rgba(148, 163, 184, 0.1);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 0.375rem;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 1rem;
}

.btn-icon:hover {
  background: rgba(148, 163, 184, 0.2);
  transform: translateY(-1px);
}

.terminal-wrapper {
  flex: 1;
  padding: 0.75rem;
  overflow: hidden;
}

.terminal-wrapper :deep(.xterm) {
  height: 100%;
}

.console-placeholder {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1.5rem;
  color: rgba(148, 163, 184, 0.8);
}

.console-placeholder p {
  font-size: 1rem;
  margin: 0;
}

.btn-open {
  padding: 0.75rem 1.5rem;
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  color: white;
  border: none;
  border-radius: 0.5rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-open:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
}
</style>
