<template>
  <BasePageShell
    title="Applications"
    description="Monitor app health, track live metrics, and control runtimes in real time."
    :padded="false"
  >
    <template #meta>
      <el-tag size="small" effect="dark">
        {{ summary.total }} total
      </el-tag>
      <el-tag size="small" type="success" effect="dark">
        {{ summary.running }} running
      </el-tag>
      <el-tag
        v-if="summary.installing > 0"
        size="small"
        type="warning"
        effect="dark"
      >
        {{ summary.installing }} installing
      </el-tag>
    </template>

    <template #actions>
      <el-button
        type="primary"
        plain
        :loading="isRefreshing"
        @click="handleRefresh"
      >
        <el-icon><RefreshIcon /></el-icon>
        Refresh
      </el-button>
      <el-button type="success" @click="showAddDialog">
        <el-icon><PlusIcon /></el-icon>
        Add app
      </el-button>
    </template>

    <div class="dashboard-content">
      <transition name="fade">
        <el-alert
          v-if="error"
          class="dashboard-alert"
          :title="error"
          type="error"
          show-icon
          closable
          @close="clearError"
        />
      </transition>

      <div v-if="isInitialLoading" class="state-card">
        <el-empty description="Loading applications…" image-size="120" />
      </div>

      <div v-else-if="isEmpty" class="state-card state-card--empty">
        <el-empty description="No applications configured" image-size="160">
          <template #description>
            <p>Create or upload an app to get started.</p>
          </template>
          <div class="empty-actions">
            <el-button type="primary" @click="showAddDialog">
              <el-icon><PlusIcon /></el-icon>
              Add app
            </el-button>
            <el-button type="info" plain @click="handleNavigateFiles">
              <el-icon><FolderIcon /></el-icon>
              Open files
            </el-button>
          </div>
        </el-empty>
      </div>

      <dashboard-grid
        v-else
        :apps="apps"
        @action="handleAction"
        @command="handleCommand"
        @open-file="handleOpenFile"
        @open-console="handleOpenConsole"
      />
    </div>
  </BasePageShell>

  <el-dialog
    v-model="addDialogVisible"
    title="Create app"
    width="600px"
  >
    <el-form :model="newApp" label-width="120px" label-position="top">
      <el-form-item label="Name" required>
        <el-input v-model="newApp.name" placeholder="my-app" />
      </el-form-item>
      <el-form-item label="Type">
        <el-select v-model="newApp.type" placeholder="Select type">
          <el-option label="Node.js" value="node" />
          <el-option label="Python" value="python" />
          <el-option label="CLI" value="cli" />
        </el-select>
      </el-form-item>
      <el-form-item label="Working directory">
        <el-input v-model="newApp.cwd" placeholder="/path/to/project" />
      </el-form-item>
      <el-form-item label="Start command">
        <el-input v-model="newApp.startCmd" placeholder="npm start" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="addDialogVisible = false">Cancel</el-button>
      <el-button type="primary" :loading="isCreating" @click="handleCreateApp">
        Create
      </el-button>
    </template>
  </el-dialog>

  <el-dialog
    v-model="installDialogVisible"
    title="Install dependencies"
    width="500px"
  >
    <el-form :model="installForm" label-width="120px" label-position="top">
      <el-form-item label="Package manager">
        <el-select v-model="installForm.manager" placeholder="Select manager">
          <el-option label="npm" value="npm" />
          <el-option label="pip" value="pip" />
        </el-select>
      </el-form-item>
      <el-form-item label="Arguments">
        <el-input
          v-model="installForm.args"
          placeholder="install or install express"
          type="textarea"
          :rows="2"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="installDialogVisible = false">Cancel</el-button>
      <el-button type="primary" @click="handleInstall">
        Install
      </el-button>
    </template>
  </el-dialog>

  <file-drawer :is-open="fileDrawerOpen" @close="fileDrawerOpen = false" />
  <console-modal
    :is-open="consoleModalOpen"
    :app-id="selectedConsoleAppId ?? undefined"
    :app-name="selectedConsoleAppName ?? undefined"
    @close="consoleModalOpen = false"
  />
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, inject, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElNotification } from 'element-plus';
import { RefreshLeft, Plus, FolderOpened } from '@element-plus/icons-vue';

import BasePageShell from '@/components/layout/BasePageShell.vue';
import DashboardGrid from '@/components/DashboardGrid.vue';
import { useAppsStore } from '@/stores/apps';
import { apiClient } from '@/services/api';
import type { WebSocketClient } from '@/stores/apps';

const FileDrawer = defineAsyncComponent(() => import('@/components/FileDrawer.vue'));
const ConsoleModal = defineAsyncComponent(() => import('@/components/ConsoleModal.vue'));

const RefreshIcon = RefreshLeft;
const PlusIcon = Plus;
const FolderIcon = FolderOpened;

const router = useRouter();
const appsStore = useAppsStore();
const eventsClient = inject<WebSocketClient>('eventsClient');

const isRefreshing = ref(false);
const isCreating = ref(false);
const error = ref<string | null>(null);
const addDialogVisible = ref(false);
const installDialogVisible = ref(false);
const fileDrawerOpen = ref(false);
const consoleModalOpen = ref(false);
const selectedConsoleAppId = ref<string | null>(null);
const selectedConsoleAppName = ref<string | null>(null);
const selectedInstallAppId = ref<string | null>(null);

const newApp = ref({
  name: '',
  type: 'node',
  cwd: '',
  startCmd: ''
});

const installForm = ref({
  manager: 'npm',
  args: 'install'
});

const apps = computed(() => appsStore.sortedApps);

const isInitialLoading = computed(() => appsStore.isLoading && apps.value.length === 0);
const isEmpty = computed(() => !appsStore.isLoading && apps.value.length === 0);

const summary = computed(() => {
  const list = apps.value;
  const running = list.filter((app) => app.status === 'running').length;
  const installing = list.filter((app) => app.installState === 'installing' || app.isInstalling).length;
  return {
    total: list.length,
    running,
    installing
  };
});

const notify = (options: { title: string; message: string; type?: 'success' | 'warning' | 'error' | 'info' }) => {
  ElNotification({
    position: 'bottom-right',
    duration: 3200,
    ...options
  });
};

const clearError = () => {
  error.value = null;
};

const handleRefresh = async () => {
  isRefreshing.value = true;
  try {
    await appsStore.fetchApps();
    notify({ title: 'Refreshed', message: 'Applications updated', type: 'success' });
  } catch (err: any) {
    notify({
      title: 'Refresh failed',
      message: err?.response?.data?.error ?? err?.message ?? 'Failed to refresh apps',
      type: 'error'
    });
  } finally {
    isRefreshing.value = false;
  }
};

const showAddDialog = () => {
  newApp.value = {
    name: '',
    type: 'node',
    cwd: '',
    startCmd: ''
  };
  addDialogVisible.value = true;
};

const handleCreateApp = async () => {
  const name = newApp.value.name.trim();
  if (!name) {
    notify({
      title: 'Name required',
      message: 'Please provide a name for the app.',
      type: 'warning'
    });
    return;
  }

  isCreating.value = true;
  try {
    await apiClient.post('/api/apps', {
      ...newApp.value,
      name
    });
    notify({
      title: 'App created',
      message: `“${name}” has been added.`,
      type: 'success'
    });
    addDialogVisible.value = false;
    await appsStore.fetchApps();
  } catch (err: any) {
    notify({
      title: 'Create failed',
      message: err?.response?.data?.error ?? err?.message ?? 'Failed to create app',
      type: 'error'
    });
  } finally {
    isCreating.value = false;
  }
};

const handleAction = async ({ action, id }: { action: string; id: string }) => {
  try {
    switch (action) {
      case 'start':
        await appsStore.startApp(id);
        notify({ title: 'Start requested', message: 'App start request sent.', type: 'success' });
        break;
      case 'stop':
        await appsStore.stopApp(id);
        notify({ title: 'Stop requested', message: 'App stop request sent.', type: 'success' });
        break;
      case 'restart':
        await appsStore.restartApp(id);
        notify({ title: 'Restart requested', message: 'App restart request sent.', type: 'success' });
        break;
      default:
        break;
    }
  } catch (err: any) {
    notify({
      title: 'Action failed',
      message: err?.response?.data?.error ?? err?.message ?? 'Failed to perform action',
      type: 'error'
    });
  }
};

const handleCommand = ({ command, id }: { command: string; id: string }) => {
  if (command === 'install') {
    selectedInstallAppId.value = id;
    const app = appsStore.getAppById(id);
    installForm.value = {
      manager: app?.type === 'python' ? 'pip' : 'npm',
      args: 'install'
    };
    installDialogVisible.value = true;
  }
};

const handleInstall = async () => {
  if (!selectedInstallAppId.value) {
    return;
  }
  try {
    const args = installForm.value.args.trim().split(/\s+/).filter(Boolean);
    await appsStore.installApp(selectedInstallAppId.value, {
      manager: installForm.value.manager,
      args
    });
    notify({
      title: 'Install started',
      message: 'Dependency installation has been triggered.',
      type: 'success'
    });
    installDialogVisible.value = false;
    selectedInstallAppId.value = null;
  } catch (err: any) {
    notify({
      title: 'Install failed',
      message: err?.response?.data?.error ?? err?.message ?? 'Failed to install dependencies',
      type: 'error'
    });
  }
};

const handleNavigateFiles = () => {
  router.push('/files');
};

const handleOpenFile = (id: string) => {
  appsStore.selectedAppId = id;
  fileDrawerOpen.value = true;
};

const handleOpenConsole = (id: string) => {
  const app = appsStore.getAppById(id);
  selectedConsoleAppId.value = id;
  selectedConsoleAppName.value = app?.name ?? id;
  consoleModalOpen.value = true;
};

let unsubscribeWs: (() => void) | null = null;

onMounted(async () => {
  appsStore.loadOrder();
  try {
    await appsStore.fetchApps();
  } catch (err: any) {
    error.value = err?.message ?? 'Failed to load apps';
  }

  if (eventsClient) {
    unsubscribeWs = appsStore.attachWebSocket(eventsClient);
  }
});

onBeforeUnmount(() => {
  if (unsubscribeWs) {
    unsubscribeWs();
    unsubscribeWs = null;
  }
});
</script>

<style scoped>
.dashboard-content {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.dashboard-alert {
  border-radius: 1rem;
  backdrop-filter: blur(10px);
  box-shadow: var(--shadow-md);
}

.state-card {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 320px;
  border-radius: 1.5rem;
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  backdrop-filter: blur(20px);
  box-shadow: var(--shadow-lg);
  transition: all var(--transition-base);
}

.state-card:hover {
  box-shadow: var(--shadow-xl);
  border-color: var(--border-default);
}

.state-card--empty {
  padding: 2rem 0;
}

.empty-actions {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
  justify-content: center;
  margin-top: 1rem;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

:deep(.el-dialog__body) {
  padding-top: 1rem;
}
</style>
