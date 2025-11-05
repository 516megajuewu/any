<template>
  <div
    class="files-view"
    :class="{ 'is-drag-over': isDragOver }"
    @dragover.prevent="onDragOver"
    @dragleave="onDragLeave"
    @drop.prevent="onDrop"
  >
    <div class="files-layout">
      <div class="explorer-panel">
        <FileExplorer
          :base="base"
          :path="path"
          :items="items"
          :loading="loading"
          :selected-path="selectedPath"
          :view-mode="viewMode"
          :search-query="searchQuery"
          :allow-root-access="allowRootBrowsing"
          :allow-mutations="canMutate"
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
        <div class="editor-header">
          <div class="editor-meta">
            <el-tag size="small" effect="plain">{{ baseLabel }}</el-tag>
            <span class="editor-path">/{{ pathDisplay }}</span>
            <el-tag
              v-if="hasUnsavedChanges"
              type="warning"
              size="small"
              effect="plain"
            >
              Unsaved
            </el-tag>
          </div>
          <el-button size="small" :loading="loading" @click="refreshCurrentDirectory">
            <el-icon><RefreshIcon /></el-icon>
            Refresh
          </el-button>
        </div>

        <div v-if="!openFile" class="editor-placeholder">
          <el-empty description="Select a file to edit" image-size="150" />
        </div>
        <MonacoEditor
          v-else
          v-model="editorContent"
          :file-path="openFile.path"
          @save="handleEditorSave"
        />
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
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Refresh as RefreshIcon, Upload as UploadIcon } from '@element-plus/icons-vue';
import FileExplorer from '@/components/FileExplorer.vue';
import MonacoEditor from '@/components/MonacoEditor.vue';
import { useFileBrowser } from '@/composables/useFileBrowser';
import type { FileEntry, UploadStrategy } from '@/services/files';
import type { FileBase } from '@/services/files';
import type { RecentFileEntry } from '@/stores/fileBrowser';

const browser = useFileBrowser();

const {
  base,
  path,
  items,
  loading,
  viewMode,
  searchQuery,
  openFile,
  selectedPath,
  recentlyOpened,
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
const recentItems = computed(() => recentlyOpened.value.slice(0, 8));

const folderFromFile = computed(() => {
  if (uploadFilesBuffer.value.length !== 1) return '';
  const file = uploadFilesBuffer.value[0];
  if (!file) return '';
  const name = file.name;
  return name.substring(0, name.lastIndexOf('.')) || name;
});

onMounted(async () => {
  try {
    await browser.ensurePermissionsLoaded();
    await initializeForApp(null, { force: true });
  } catch (error) {
    console.warn('Failed to initialize file browser', error);
  }
});

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
.files-view {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 180px);
  position: relative;
  transition: background 0.2s;
}

.files-view.is-drag-over {
  background: rgba(59, 130, 246, 0.05);
  border: 2px dashed rgba(59, 130, 246, 0.5);
}

.files-layout {
  display: grid;
  grid-template-columns: 370px 1fr;
  gap: 1.5rem;
  height: 100%;
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
  gap: 1rem;
}

.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(15, 23, 42, 0.7);
  border-radius: 0.75rem;
  border: 1px solid var(--border-subtle);
  padding: 0.75rem 1rem;
}

.editor-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--text-muted);
  font-size: 0.85rem;
}

.editor-path {
  font-family: "JetBrains Mono", "Fira Code", monospace;
  color: var(--text-emphasis);
}

.editor-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  background: var(--surface);
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
  background: rgba(59, 130, 246, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  pointer-events: none;
}

.drop-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: 2rem;
  background: var(--surface);
  border-radius: 1rem;
  border: 2px dashed var(--primary);
  font-size: 1.25rem;
  font-weight: 500;
  color: var(--text-emphasis);
}

.drop-inner .el-icon {
  font-size: 3rem;
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
  .files-layout {
    grid-template-columns: 1fr;
    grid-template-rows: 320px 1fr;
  }
}
</style>
