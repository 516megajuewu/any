<template>
  <div
    class="files-view"
    :class="{ 'is-drag-over': isDragOver }"
    @dragover.prevent="onDragOver"
    @dragleave="onDragLeave"
    @drop.prevent="onDrop"
  >
    <div class="files-layout">

        <FileExplorer
          :base="currentBase"
          :path="currentPath"
          :items="files"
          :loading="loading"
          :selected-path="selectedPath"
          :view-mode="viewMode"
          @update:base="handleBaseUpdate"
          @update:path="handlePathUpdate"
          @update:selected-path="handleSelectionUpdate"
          @update:view-mode="handleViewModeUpdate"
          @refresh="loadFiles"
          @create-file="handleCreateFile"
          @create-folder="handleCreateFolder"
          @rename="handleRename"
          @delete="handleDelete"
          @upload="handleUploadTrigger"
          @select="handleFileSelect"
          @open="handleFileOpen"
        />
      </div>

      <div class="editor-panel">
        <div v-if="!openFile" class="editor-placeholder">
          <el-empty description="Select a file to edit" image-size="150" />
        </div>
        <MonacoEditor
          v-else
          v-model="fileContent"
          :file-path="openFile.path"
          @save="handleFileSave"
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
          v-if="uploadFiles.length === 1"
          type="info"
          :closable="false"
          show-icon
        >
          Single file: will create a folder named "{{ folderFromFile }}"
        </el-alert>

        <div class="upload-list">
          <div class="upload-header">Files to upload ({{ uploadFiles.length }}):</div>
          <div class="files-container">
            <div v-for="(file, i) in uploadFiles" :key="i" class="file-row">
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
        <el-button @click="uploadDialogVisible = false">Cancel</el-button>
        <el-button type="primary" :loading="uploading" @click="submitUpload">
          Upload
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { ElMessage } from 'element-plus';
import { Upload as UploadIcon } from '@element-plus/icons-vue';
import FileExplorer from '@/components/FileExplorer.vue';
import MonacoEditor from '@/components/MonacoEditor.vue';
import type { FileBase, FileEntry, UploadStrategy } from '@/services/files';
import * as filesService from '@/services/files';

const currentBase = ref<FileBase>('apps');
const currentPath = ref('.');
const selectedPath = ref<string | null>(null);
const viewMode = ref<'list' | 'tree'>('list');
const files = ref<FileEntry[]>([]);
const loading = ref(false);
const openFile = ref<FileEntry | null>(null);
const fileContent = ref('');

const uploadDialogVisible = ref(false);
const uploadFiles = ref<File[]>([]);
const uploadStrategy = ref<UploadStrategy>('replace');
const uploading = ref(false);
const isDragOver = ref(false);

const folderFromFile = computed(() => {
  if (uploadFiles.value.length !== 1) return '';
  const name = uploadFiles.value[0].name;
  return name.substring(0, name.lastIndexOf('.')) || name;
});

async function loadFiles() {
  loading.value = true;
  try {
    const result = await filesService.listFiles(currentBase.value, currentPath.value);
    files.value = result.items;
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.error || 'Failed to load files');
    files.value = [];
  } finally {
    loading.value = false;
  }
}

function handleBaseUpdate(base: FileBase) {
  if (currentBase.value === base) return;
  currentBase.value = base;
  openFile.value = null;
  fileContent.value = '';
  selectedPath.value = null;
}

function handlePathUpdate(path: string) {
  if (currentPath.value === path && !loading.value) {
    loadFiles();
    return;
  }
  currentPath.value = path;
  selectedPath.value = null;
  loadFiles();
}

function handleSelectionUpdate(path: string | null) {
  selectedPath.value = path;
}

function handleViewModeUpdate(mode: 'list' | 'tree') {
  viewMode.value = mode;
}

function handleFileSelect(entry: FileEntry) {
  if (entry.type === 'file') {
    selectedPath.value = entry.path;
  }
}

async function handleFileOpen(entry: FileEntry) {
  if (entry.type !== 'file') return;

  try {
    const content = await filesService.readFileContent(currentBase.value, entry.path);
    openFile.value = entry;
    fileContent.value = content;
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.error || 'Failed to open file');
  }
}

async function handleFileSave(payload: { content: string; resolve: (success: boolean) => void }) {
  if (!openFile.value) {
    payload.resolve(false);
    return;
  }

  try {
    await filesService.writeFileContent(currentBase.value, openFile.value.path, payload.content);
    payload.resolve(true);
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.error || 'Failed to save file');
    payload.resolve(false);
  }
}

async function handleCreateFile(payload: { name: string; path: string }) {
  try {
    await filesService.writeFileContent(currentBase.value, payload.path, '');
    ElMessage.success('File created');
    selectedPath.value = payload.path;
    await loadFiles();
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.error || 'Failed to create file');
  }
}

async function handleCreateFolder(payload: { name: string; path: string }) {
  try {
    await filesService.createDirectory(currentBase.value, payload.path);
    ElMessage.success('Folder created');
    selectedPath.value = payload.path;
    await loadFiles();
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.error || 'Failed to create folder');
  }
}

async function handleRename(payload: { entry: FileEntry; newName: string; newPath: string }) {
  try {
    await filesService.renamePath(currentBase.value, payload.entry.path, payload.newPath);
    ElMessage.success('Renamed successfully');

    if (openFile.value?.path === payload.entry.path) {
      try {
        const content = await filesService.readFileContent(currentBase.value, payload.newPath);
        openFile.value = {
          ...openFile.value,
          name: payload.newName,
          path: payload.newPath
        };
        fileContent.value = content;
      } catch (error: any) {
        ElMessage.error(error?.response?.data?.error || 'Failed to reload file after rename');
        openFile.value = null;
        fileContent.value = '';
      }
    }

    selectedPath.value = payload.newPath;
    await loadFiles();
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.error || 'Failed to rename');
  }
}

async function handleDelete(entry: FileEntry) {
  try {
    await filesService.removePath(currentBase.value, entry.path);
    ElMessage.success('Deleted successfully');
    if (openFile.value?.path === entry.path) {
      openFile.value = null;
      fileContent.value = '';
    }
    if (selectedPath.value === entry.path) {
      selectedPath.value = null;
    }
    await loadFiles();
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.error || 'Failed to delete');
  }
}

function handleUploadTrigger(payload: { files: File[] }) {
  if (!payload.files.length) return;
  uploadFiles.value = payload.files;
  uploadDialogVisible.value = true;
  isDragOver.value = false;
}

async function submitUpload() {
  if (uploadFiles.value.length === 0) return;

  uploading.value = true;

  try {
    await filesService.uploadFiles({
      base: currentBase.value,
      targetPath: currentPath.value,
      strategy: uploadStrategy.value,
      files: uploadFiles.value
    });

    ElMessage.success(`Uploaded ${uploadFiles.value.length} file(s)`);
    uploadDialogVisible.value = false;
    uploadFiles.value = [];
    await loadFiles();
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.error || 'Upload failed');
  } finally {
    uploading.value = false;
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

loadFiles();
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
  grid-template-columns: 350px 1fr;
  gap: 1.5rem;
  height: 100%;
}

.explorer-panel,
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
  background: var(--surface);
  border-radius: 0.75rem;
  border: 1px solid var(--border-subtle);
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
  max-height: 200px;
  overflow-y: auto;
  padding: 0.75rem;
  background: var(--surface-subtle);
  border-radius: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
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
    grid-template-rows: 300px 1fr;
  }
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
</style>
