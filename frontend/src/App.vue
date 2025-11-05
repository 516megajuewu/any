<template>
  <el-container class="app-layout">
    <el-aside width="220px" class="app-aside">
      <div class="app-logo">
        <span class="app-logo__dot" />
        <span class="app-logo__title">Control Center</span>
      </div>
      <el-menu :default-active="activeRoute" class="app-menu" @select="onSelect">
        <el-menu-item index="/">
          <span>Dashboard</span>
        </el-menu-item>
        <el-menu-item index="/files">
          <span>Files</span>
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
          <span class="status-label">{{ statusLabel }}</span>
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

const router = useRouter();
const route = useRoute();
const appStore = useAppStore();

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
    case 'dashboard':
    default:
      return 'Dashboard';
  }
});

const statusLabel = computed(() => {
  const connected = appStore.isEventStreamConnected;
  const healthy = appStore.isBackendHealthy;

  if (connected && healthy) {
    return 'Online';
  }

  if (healthy) {
    return 'Degraded';
  }

  return 'Offline';
});

const statusClass = computed(() => ({
  'is-online': appStore.isBackendHealthy,
  'is-offline': !appStore.isBackendHealthy
}));

const statusIndicatorClass = computed(() => ({
  'status-indicator--online': appStore.isEventStreamConnected && appStore.isBackendHealthy,
  'status-indicator--degraded': appStore.isBackendHealthy && !appStore.isEventStreamConnected,
  'status-indicator--offline': !appStore.isBackendHealthy
}));
</script>

<style scoped>
.app-layout {
  min-height: 100vh;
  background: var(--surface-subtle);
}

.app-aside {
  background: var(--surface-stronger);
  border-right: 1px solid var(--border-subtle);
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
}

.app-menu :deep(.el-menu-item.is-active) {
  color: var(--text-emphasis);
  background: rgba(59, 130, 246, 0.15);
}

.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem 2rem;
  background: var(--surface); 
  border-bottom: 1px solid var(--border-subtle);
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
  background: var(--surface-stronger);
  color: var(--text-muted);
  font-size: 0.85rem;
  border: 1px solid var(--border-subtle);
}

.header-status.is-online {
  color: var(--success-strong);
  border-color: rgba(34, 197, 94, 0.35);
  background: rgba(34, 197, 94, 0.08);
}

.header-status.is-offline {
  color: var(--danger-strong);
  border-color: rgba(248, 113, 113, 0.35);
  background: rgba(248, 113, 113, 0.08);
}

.status-indicator {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: block;
}

.status-indicator--online {
  background: var(--success);
  box-shadow: 0 0 10px rgba(34, 197, 94, 0.6);
}

.status-indicator--degraded {
  background: var(--warning);
  box-shadow: 0 0 10px rgba(250, 204, 21, 0.45);
}

.status-indicator--offline {
  background: var(--danger);
  box-shadow: 0 0 10px rgba(248, 113, 113, 0.45);
}

.app-main {
  padding: 2rem;
  background: linear-gradient(155deg, rgba(30, 41, 59, 0.9), rgba(15, 23, 42, 0.95));
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
    border-bottom: 1px solid var(--border-subtle);
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
