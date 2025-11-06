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
import { useHotReload } from '@/composables/useHotReload';
import { useWebSocketStatus } from '@/composables/useWebSocketStatus';

const router = useRouter();
const route = useRoute();

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
  position: relative;
}

.app-layout::before {
  content: '';
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 400px;
  background: radial-gradient(ellipse at top, rgba(59, 130, 246, 0.15) 0%, transparent 70%);
  pointer-events: none;
  z-index: 0;
}

.app-aside {
  background: var(--glass-bg);
  backdrop-filter: blur(20px);
  border-right: 1px solid var(--border-default);
  display: flex;
  flex-direction: column;
  padding: 1.5rem 1rem;
  position: relative;
  z-index: 1;
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
  background: var(--gradient-primary);
  box-shadow: 0 0 16px rgba(59, 130, 246, 0.8), 0 0 4px rgba(59, 130, 246, 0.5);
  animation: pulse-glow 2s ease-in-out infinite;
}

@keyframes pulse-glow {
  0%, 100% { 
    opacity: 1;
    box-shadow: 0 0 16px rgba(59, 130, 246, 0.8), 0 0 4px rgba(59, 130, 246, 0.5);
  }
  50% { 
    opacity: 0.8;
    box-shadow: 0 0 24px rgba(59, 130, 246, 1), 0 0 8px rgba(59, 130, 246, 0.7);
  }
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
  transition: all var(--transition-base);
  position: relative;
  overflow: hidden;
}

.app-menu :deep(.el-menu-item::before) {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 0;
  background: var(--gradient-primary);
  transition: height var(--transition-base);
  border-radius: 0 2px 2px 0;
}

.app-menu :deep(.el-menu-item:hover) {
  background: var(--bg-hover);
  color: var(--text-secondary);
  transform: translateX(2px);
}

.app-menu :deep(.el-menu-item.is-active) {
  color: var(--text-emphasis);
  background: var(--accent-light);
  font-weight: 600;
}

.app-menu :deep(.el-menu-item.is-active::before) {
  height: 60%;
}

.app-menu :deep(.el-menu-item.is-active:hover) {
  background: var(--accent-light);
  opacity: 0.9;
}

.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem 2rem;
  background: var(--glass-bg);
  backdrop-filter: blur(20px);
  border-bottom: 1px solid var(--border-default);
  position: relative;
  z-index: 1;
  box-shadow: var(--shadow-sm);
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
  padding: 0.5rem 1rem;
  border-radius: 999px;
  background: var(--bg-tertiary);
  color: var(--text-muted);
  font-size: 0.85rem;
  border: 1px solid var(--border-default);
  transition: all var(--transition-base);
  box-shadow: var(--shadow-sm);
  font-weight: 500;
}

.header-status.is-online {
  color: var(--success-strong);
  border-color: var(--success);
  background: var(--success-light);
  box-shadow: 0 0 20px rgba(16, 185, 129, 0.2);
}

.header-status.is-offline {
  color: var(--danger-strong);
  border-color: var(--danger);
  background: var(--danger-light);
  box-shadow: 0 0 20px rgba(239, 68, 68, 0.2);
}

.header-status.is-degraded {
  color: var(--warning-strong);
  border-color: var(--warning);
  background: var(--warning-light);
  box-shadow: 0 0 20px rgba(245, 158, 11, 0.2);
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
  background: transparent;
  min-height: calc(100vh - 80px);
  position: relative;
  z-index: 1;
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
