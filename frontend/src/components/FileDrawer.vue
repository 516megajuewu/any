<template>
  <el-drawer
    :model-value="isOpen"
    size="70%"
    class="file-drawer"
    :with-header="false"
    destroy-on-close="false"
    @close="handleClose"
  >
    <div
      class="drawer-content"
      :class="{ 'is-drag-over': isDragOver }"
      @dragover.prevent="onDragOver"
      @dragleave="onDragLeave"
      @drop.prevent="onDrop"
    >
      <div class="drawer-header">
        <div class="header-info">
          <h3 class="header-title">{{ currentApp?.name ?? 'Project Files' }}</h3>
          <div class="header-meta">
            <el-tag size="small" effect="plain">{{ baseLabel }}</el-tag>
            <span class="header-path">/{{ pathDisplay }}</span>
            <el-tag
              v-if="hasUnsavedChanges.value"
              type="warning"
              size="small"
              effect="plain"
            >
              Unsaved changes
            </el-tag>
          </div>
        </div>
        <div class="header-actions">
          <el-button size="small" :loading="loading.value" @click="refreshCurrentDirectory">
            <el-icon><RefreshIcon /></el-icon>
            Refresh
          </el-button>
        </div>
      </div>

      <div class="drawer-body">
        <div class="explorer-panel">
          <FileExplorer
            :base="base.value"
            :path="path.value"
            :items="items.value"
            :loading="loading.value"
            :selected-path="selectedPath.value"
            :view-mode="viewMode.value"
            :search-query="searchQuery.value"
            :allow-root-access="allowRootBrowsing.value"
            :allow-mutations="canMutate.value"
            @update:base="handleBaseUpdate"
            @update:path="handlePathUpdate"
            @update:selected-path="handleSelectionUpdate"
            @update:view-mode="handleViewModeUpdate"
            @update:search-query="handleSearchUpdate"
            @refresh="refreshCurrentDirectory"
            @create-file="handleCreateFile"
            @create-folder="handleCreateFolder"
            @rename="handleRename"
            @delete="handleDelete"
            @upload="handleUploadTrigger"
            @select="handleSelect"
            @open="handleOpenEntry"
          />

          <div v-if="recentItems.length" class="recent-section">
            <div class="recent-title">Recently opened</div>
            <div class="recent-chips">
              <el-tag
                v-for="item in recentItems"
                :key="item.base + item.path"
                size="small"
                effect="plain"
                class="recent-chip"
                @click="openRecent(item)"
              >
                {{ item.name }}
              </el-tag>
            </div>
          </div>
        </div>

        <div class="editor-panel">
          <div v-if="!openFile.value" class="editor-placeholder">
            <el-empty description="Select a file to edit" image-size="150" />
          </div>
          <MonacoEditor
            v-else
            v-model="editorContent"
            :file-path="openFile.value.path"
            @save="handleEditorSave"
          />
        </div>
      </div>
    </div>

    <div v-if="isDragOver" class="drop-overlay">
      <div class="drop-inner">
        <el-icon><UploadIcon /></el-icon>
        <span>Drop files to upload</span>
      </div>
    </div>

    <el-dialog
      v-model="uploadDialogVisible"
      title="Upload Files"
      width="500px"
    >
      <div class="upload-content">
        <el-alert
          v-if="uploadFilesBuffer.length === 1"
          type="info"
          :closable="false"
          show-icon
        >
          Single file: will create a folder named "{{ folderFromFile }}"
        </el-alert>

        <div class="upload-list">
          <div class="upload-header">Files to upload ({{ uploadFilesBuffer.length }}):</div>
          <div class="files-container">
            <div v-for="(file, i) in uploadFilesBuffer" :key="i" class="file-row">
              {{ file.name }} <span class="file-size">({{ formatSize(file.size) }})</span>
            </div>
          </div>
        </div>

        <el-form label-position="top">
          <el-form-item label="Conflict Resolution:">
            <el-radio-group v-model="uploadStrategy">
              <el-radio value="replace">Replace existing files</el-radio>
              <el-radio value="skip">Skip existing files</el-radio>
              <el-radio value="rename">Rename new files</el-radio>
            </el-radio-group>
          </el-form-item>
        </el-form>
      </div>

      <template #footer>
        <el-button @click="closeUploadDialog">Cancel</el-button>
        <el-button type="primary" :loading="uploading" @click="submitUpload">
          Upload
        </el-button>
      </template>
    </el-dialog>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Refresh as RefreshIcon, Upload as UploadIcon } from '@element-plus/icons-vue';
import FileExplorer from '@/components/FileExplorer.vue';
import MonacoEditor from '@/components/MonacoEditor.vue';
import { useAppsStore } from '@/stores/apps';
import { useFileBrowser } from '@/composables/useFileBrowser';
import type { FileEntry, UploadStrategy } from '@/services/files';
import type { FileBase } from '@/services/files';
import type { RecentFileEntry } from '@/stores/fileBrowser';

const props = withDefaults(defineProps<{ isOpen: boolean }>(), {
  isOpen: false
});

const emit = defineEmits(['close']);

const appsStore = useAppsStore();
const browser = useFileBrowser();

const {
  base,
  path,
  items,
  loading,
  viewMode,
  searchQuery,
  openFile,
  recentlyOpened,
  selectedPath,
  allowRootBrowsing,
  allowRootMutations,
  hasUnsavedChanges,
  initializeForApp,
  changeBase,
  changePath,
  selectPath,
  setViewMode,
  setSearchQuery,
  openEntry,
  createFile,
  createFolder,
  renameEntry,
  deleteEntry,
  uploadFiles,
  refresh,
  updateOpenFileContent,
  saveOpenFile,
  openFileByPath
} = browser;

const isDragOver = ref(false);
const uploadDialogVisible = ref(false);
const uploadFilesBuffer = ref<File[]>([]);
const uploadStrategy = ref<UploadStrategy>('replace');
const uploading = ref(false);

const editorContent = computed({
  get: () => openFile.value?.content ?? '',
  set: (value: string) => {
    if (openFile.value) {
      updateOpenFileContent(value);
    }
  }
});

const baseLabel = computed(() => (base.value === 'apps' ? 'Apps directory' : 'Project root'));
const pathDisplay = computed(() => (path.value === '.' ? '.' : path.value));
const canMutate = computed(() => (base.value === 'root' ? allowRootMutations.value : true));
const recentItems = computed(() => recentlyOpened.value.slice(0, 6));

const currentApp = computed(() => {
  const id = appsStore.selectedAppId;
  return id ? appsStore.getAppById(id) : null;
});

const folderFromFile = computed(() => {
  if (uploadFilesBuffer.value.length !== 1) return '';
  const name = uploadFilesBuffer.value[0].name;
  return name.substring(0, name.lastIndexOf('.')) || name;
});

watch(
  () => props.isOpen,
  async (open) => {
    if (open) {
      try {
        await browser.ensurePermissionsLoaded();
        await initializeForApp(appsStore.selectedAppId ?? null, { force: true });
      } catch (error) {
        console.warn('Failed to initialize file browser drawer', error);
      }
    } else {
      isDragOver.value = false;
      closeUploadDialog();
    }
  },
  { immediate: true }
);

watch(
  () => appsStore.selectedAppId,
  async (appId) => {
    if (props.isOpen) {
      try {
        await initializeForApp(appId ?? null, { force: true });
      } catch (error) {
        console.warn('Failed to refresh file browser for app', error);
      }
    }
  }
);

function handleClose() {
  emit('close');
}

async function handleBaseUpdate(nextBase: FileBase) {
  await changeBase(nextBase, { resetPath: true });
}

async function handlePathUpdate(nextPath: string) {
  await changePath(nextPath, { force: false });
}

function handleSelectionUpdate(value: string | null) {
  selectPath(value);
}

function handleViewModeUpdate(mode: 'list' | 'tree') {
  setViewMode(mode);
}

function handleSearchUpdate(query: string) {
  setSearchQuery(query);
}

function handleCreateFile(payload: { name: string; path: string }) {
  if (!canMutate.value) return;
  createFile(payload.name, payload.path);
}

function handleCreateFolder(payload: { name: string; path: string }) {
  if (!canMutate.value) return;
  createFolder(payload.name, payload.path);
}

function handleRename(payload: { entry: FileEntry; newName: string; newPath: string }) {
  if (!canMutate.value) return;
  renameEntry(payload.entry, payload.newPath);
}

function handleDelete(entry: FileEntry) {
  if (!canMutate.value) return;
  deleteEntry(entry);
}

function handleSelect(entry: FileEntry) {
  selectPath(entry.path);
}

function handleOpenEntry(entry: FileEntry) {
  openEntry(entry);
}

function handleUploadTrigger(payload: { files: File[] }) {
  if (!payload.files.length) return;
  uploadFilesBuffer.value = payload.files;
  uploadDialogVisible.value = true;
  isDragOver.value = false;
}

function closeUploadDialog() {
  uploadDialogVisible.value = false;
  uploadFilesBuffer.value = [];
  uploadStrategy.value = 'replace';
}

async function submitUpload() {
  if (uploadFilesBuffer.value.length === 0) return;

  uploading.value = true;
  try {
    await uploadFiles(uploadFilesBuffer.value, uploadStrategy.value);
    uploadDialogVisible.value = false;
    uploadFilesBuffer.value = [];
  } catch (error) {
    console.warn('Upload failed', error);
  } finally {
    uploading.value = false;
  }
}

function refreshCurrentDirectory() {
  refresh();
}

function onDragOver(event: DragEvent) {
  if (event.dataTransfer?.types.includes('Files')) {
    isDragOver.value = true;
  }
}

function onDragLeave(event: DragEvent) {
  const related = event.relatedTarget as Node | null;
  if (!related || !(event.currentTarget as Node).contains(related)) {
    isDragOver.value = false;
  }
}

function onDrop(event: DragEvent) {
  isDragOver.value = false;
  if (!event.dataTransfer?.files) return;
  const files = Array.from(event.dataTransfer.files);
  if (files.length > 0) {
    handleUploadTrigger({ files });
  }
}

function formatSize(bytes: number): string {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  const val = bytes / Math.pow(k, i);
  return `${val % 1 === 0 ? val : val.toFixed(1)} ${sizes[i]}`;
}

async function handleEditorSave(payload: { content: string; resolve: (success: boolean) => void }) {
  const success = await saveOpenFile(payload.content);
  payload.resolve(success);
}

async function openRecent(item: RecentFileEntry) {
  await openFileByPath(item.path, item.base);
}
</script>

<style scoped>
.file-drawer :deep(.el-drawer__body) {
  padding: 0;
  background: transparent;
  height: 100%;
}

.drawer-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: linear-gradient(155deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.95));
  position: relative;
}

.drawer-content.is-drag-over {
  background: rgba(59, 130, 246, 0.08);
  border: 2px dashed rgba(59, 130, 246, 0.4);
}

.drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--border-subtle);
  background: rgba(15, 23, 42, 0.6);
}

.header-title {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 600;
  color: var(--text-emphasis);
}

.header-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.35rem;
  color: var(--text-muted);
  font-size: 0.85rem;
}

.header-path {
  font-family: "JetBrains Mono", "Fira Code", monospace;
  color: var(--text-emphasis);
}

.drawer-body {
  flex: 1;
  display: grid;
  grid-template-columns: 360px 1fr;
  gap: 1.25rem;
  padding: 1.25rem 1.5rem;
  min-height: 0;
}

.explorer-panel {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-height: 0;
}

.editor-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.editor-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  background: rgba(15, 23, 42, 0.7);
  border-radius: 0.75rem;
  border: 1px solid var(--border-subtle);
}

.recent-section {
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid var(--border-subtle);
  border-radius: 0.75rem;
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.recent-title {
  font-size: 0.8rem;
  text-transform: uppercase;
  color: var(--text-muted);
  letter-spacing: 0.08em;
}

.recent-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.recent-chip {
  cursor: pointer;
}

.drop-overlay {
  position: absolute;
  inset: 0;
  background: rgba(59, 130, 246, 0.18);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  pointer-events: none;
}

.drop-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 2rem;
  background: rgba(15, 23, 42, 0.95);
  border-radius: 1rem;
  border: 2px dashed var(--primary);
  font-size: 1.15rem;
  font-weight: 500;
  color: var(--text-emphasis);
}

.drop-inner .el-icon {
  font-size: 2.5rem;
  color: var(--primary);
}

.upload-content {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.upload-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.upload-header {
  font-weight: 500;
  color: var(--text-emphasis);
}

.files-container {
  max-height: 220px;
  overflow-y: auto;
  padding: 0.75rem;
  background: var(--surface-subtle);
  border-radius: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.file-row {
  font-size: 0.875rem;
  color: var(--text-emphasis);
}

.file-size {
  color: var(--text-muted);
  font-size: 0.8rem;
}

@media (max-width: 960px) {
  .drawer-body {
    grid-template-columns: 1fr;
    grid-template-rows: 320px 1fr;
  }
}
</style>
