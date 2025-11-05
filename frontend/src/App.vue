<template>
  <el-container class="app-layout">
    <el-aside width="220px" class="app-aside">
      <div class="app-logo">
        <span class="app-logo__dot" />
        <span class="app-logo__title">Control Center</span>
      </div>
      <el-menu :default-active="activeRoute" class="app-menu" @select="onSelect">
        <el-menu-item index="/apps">
          <span>Apps</span>
        </el-menu-item>
        <el-menu-item index="/files">
          <span>Files</span>
        </el-menu-item>
        <el-menu-item index="/settings">
          <span>Settings</span>
        </el-menu-item>
      </el-menu>
    </el-aside>
    <el-container>
      <el-header class="app-header">
        <div class="header-title">
          {{ pageTitle }}
        </div>
        <div class="header-status" :class="statusClass">
          <span class="status-indicator" :class="statusIndicatorClass" />
          <span class="status-label">{{ statusText }}</span>
          <el-button 
            v-if="shouldShowReconnectButton"
            type="text" 
            size="small"
            @click="manualReconnect"
            class="reconnect-btn"
          >
            Reconnect
          </el-button>
        </div>
      </el-header>
      <el-main class="app-main">
        <RouterView />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAppStore } from '@/stores/app';
import { useHotReload } from '@/composables/useHotReload';
import { useWebSocketStatus } from '@/composables/useWebSocketStatus';

const router = useRouter();
const route = useRoute();
const appStore = useAppStore();

useHotReload();
const { 
  connectionStatus, 
  statusText, 
  shouldShowReconnectButton,
  manualReconnect 
} = useWebSocketStatus();

const activeRoute = computed(() => route.path);

const onSelect = (path: string) => {
  if (path !== route.path) {
    router.push(path);
  }
};

const pageTitle = computed(() => {
  switch (route.name) {
    case 'files':
      return 'Files';
    case 'settings':
      return 'Settings';
    case 'apps':
    default:
      return 'Applications';
  }
});

const statusClass = computed(() => ({
  'is-online': connectionStatus.value === 'online',
  'is-offline': connectionStatus.value === 'offline',
  'is-degraded': connectionStatus.value === 'degraded'
}));

const statusIndicatorClass = computed(() => ({
  'status-indicator--online': connectionStatus.value === 'online',
  'status-indicator--degraded': connectionStatus.value === 'degraded',
  'status-indicator--offline': connectionStatus.value === 'offline'
}));
</script>

<style scoped>
.app-layout {
  min-height: 100vh;
  background: var(--bg-primary);
}

.app-aside {
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-default);
  display: flex;
  flex-direction: column;
  padding: 1.5rem 1rem;
}

.app-logo {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 2rem;
  font-weight: 600;
  color: var(--text-emphasis);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.app-logo__dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--primary), var(--primary-accent));
  box-shadow: 0 0 12px rgba(59, 130, 246, 0.6);
}

.app-logo__title {
  font-size: 0.9rem;
  letter-spacing: 0.1em;
}

.app-menu {
  border: none;
  background: transparent;
}

.app-menu :deep(.el-menu-item) {
  border-radius: 0.75rem;
  margin-bottom: 0.5rem;
  color: var(--text-muted);
  font-weight: 500;
  transition: all 0.2s ease;
}

.app-menu :deep(.el-menu-item:hover) {
  background: var(--bg-hover);
  color: var(--text-secondary);
}

.app-menu :deep(.el-menu-item.is-active) {
  color: var(--text-emphasis);
  background: var(--accent-primary);
}

.app-menu :deep(.el-menu-item.is-active:hover) {
  background: var(--accent-hover);
}

.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem 2rem;
  background: var(--bg-secondary); 
  border-bottom: 1px solid var(--border-default);
}

.header-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text-emphasis);
}

.header-status {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.85rem;
  border-radius: 999px;
  background: var(--bg-tertiary);
  color: var(--text-muted);
  font-size: 0.85rem;
  border: 1px solid var(--border-subtle);
  transition: all 0.2s ease;
}

.header-status.is-online {
  color: var(--success);
  border-color: var(--success);
  background: var(--success-light);
}

.header-status.is-offline {
  color: var(--danger);
  border-color: var(--danger);
  background: var(--danger-light);
}

.header-status.is-degraded {
  color: var(--warning);
  border-color: var(--warning);
  background: var(--warning-light);
}

.status-indicator {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: block;
}

.status-indicator--online {
  background: var(--success);
  box-shadow: 0 0 10px var(--success);
  animation: pulse-green 2s infinite;
}

.status-indicator--degraded {
  background: var(--warning);
  box-shadow: 0 0 10px var(--warning);
  animation: pulse-yellow 2s infinite;
}

.status-indicator--offline {
  background: var(--danger);
  box-shadow: 0 0 10px var(--danger);
  animation: pulse-red 2s infinite;
}

@keyframes pulse-green {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

@keyframes pulse-yellow {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

@keyframes pulse-red {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

.app-main {
  padding: 2rem;
  background: var(--bg-primary);
  min-height: calc(100vh - 80px);
}

.reconnect-btn {
  margin-left: 0.5rem;
  color: var(--accent-primary);
  font-size: 0.75rem;
  padding: 0.2rem 0.5rem;
  border-radius: 0.25rem;
  transition: all 0.2s ease;
}

.reconnect-btn:hover {
  background: var(--accent-light);
  color: var(--accent-hover);
}
@media (max-width: 960px) {
  .app-layout {
    flex-direction: column;
  }

  .app-aside {
    width: 100% !important;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.5rem;
    border-right: none;
    border-bottom: 1px solid var(--border-default);
  }

  .app-menu {
    width: auto;
    display: flex;
  }

  .app-menu :deep(.el-menu-item) {
    border-radius: 999px;
    margin: 0 0.25rem;
  }
}
</style>
