<template>
  <div class="dashboard-view">
    <div class="toolbar">
      <h2 class="page-title">Applications</h2>
      <div class="toolbar-actions">
        <el-button type="primary" @click="handleRefresh" :loading="isRefreshing">
          <el-icon><RefreshIcon /></el-icon>
          Refresh
        </el-button>
        <el-button type="success" @click="showAddDialog">
          <el-icon><PlusIcon /></el-icon>
          Add app
        </el-button>
      </div>
    </div>

    <el-alert
      v-if="error"
      :title="error"
      type="error"
      :closable="true"
      show-icon
      @close="clearError"
    />

    <div v-if="appsStore.isLoading && apps.length === 0" class="loading-state">
      <el-empty description="Loading apps..." image-size="120" />
    </div>

    <div v-else-if="apps.length === 0 && !appsStore.isLoading" class="empty-state">
      <el-empty description="No apps configured yet" image-size="160">
        <template #description>
          <p>Create your first app to get started.</p>
        </template>
        <el-button type="primary" @click="showAddDialog">
          <el-icon><PlusIcon /></el-icon>
          Add app
        </el-button>
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
        <el-button type="primary" @click="handleCreateApp" :loading="isCreating">
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
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, inject, defineAsyncComponent, onBeforeUnmount } from 'vue';
import { useAppsStore } from '@/stores/apps';
import { ElMessage } from 'element-plus';
import { RefreshLeft, Plus } from '@element-plus/icons-vue';
import DashboardGrid from '@/components/DashboardGrid.vue';
import { apiClient } from '@/services/api';
import type { WebSocketClient } from '@/stores/apps';

const FileDrawer = defineAsyncComponent(() => import('@/components/FileDrawer.vue'));
const ConsoleModal = defineAsyncComponent(() => import('@/components/ConsoleModal.vue'));

const appsStore = useAppsStore();
const eventsClient = inject<WebSocketClient>('eventsClient');

const RefreshIcon = RefreshLeft;
const PlusIcon = Plus;

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

const clearError = () => {
  error.value = null;
};

const handleRefresh = async () => {
  isRefreshing.value = true;
  try {
    await appsStore.fetchApps();
    ElMessage.success('Apps refreshed');
  } catch (err: any) {
    ElMessage.error(err?.message ?? 'Failed to refresh apps');
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
  if (!newApp.value.name) {
    ElMessage.error('Name is required');
    return;
  }
  isCreating.value = true;
  try {
    await apiClient.post('/api/apps', newApp.value);
    ElMessage.success(`App "${newApp.value.name}" created`);
    addDialogVisible.value = false;
    await appsStore.fetchApps();
  } catch (err: any) {
    ElMessage.error(err?.message ?? 'Failed to create app');
  } finally {
    isCreating.value = false;
  }
};

const handleAction = async ({ action, id }: { action: string; id: string }) => {
  try {
    switch (action) {
      case 'start':
        await appsStore.startApp(id);
        ElMessage.success('App started');
        break;
      case 'stop':
        await appsStore.stopApp(id);
        ElMessage.success('App stopped');
        break;
      case 'restart':
        await appsStore.restartApp(id);
        ElMessage.success('App restarted');
        break;
      default:
        break;
    }
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.error ?? err?.message ?? 'Action failed');
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
    ElMessage.success('Dependencies installed');
    installDialogVisible.value = false;
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.error ?? err?.message ?? 'Install failed');
  }
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
  }
});
</script>

<style scoped>
.dashboard-view {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.page-title {
  margin: 0;
  font-size: 1.75rem;
  font-weight: 600;
  color: var(--text-emphasis);
}

.toolbar-actions {
  display: flex;
  gap: 0.75rem;
}

.loading-state,
.empty-state {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 300px;
  background: var(--surface);
  border-radius: 1rem;
  padding: 2rem;
}

@media (max-width: 640px) {
  .toolbar {
    flex-direction: column;
    align-items: flex-start;
  }

  .toolbar-actions {
    width: 100%;
  }

  .toolbar-actions .el-button {
    flex: 1;
  }
}
</style>
