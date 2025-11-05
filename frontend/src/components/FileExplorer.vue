<template>
  <div class="file-explorer">
    <div class="explorer-header">
      <div class="header-left">
        <div class="base-selector">
          <el-select v-model="localBase" size="small" @change="handleBaseChange">
            <el-option label="Apps Directory" value="apps" />
            <el-option label="Project Root" value="root">
              <div class="root-option">
                <span>Project Root</span>
                <el-tag type="warning" size="small" effect="plain">⚠ Careful</el-tag>
              </div>
            </el-option>
          </el-select>
        </div>
        <div class="view-toggle">
          <el-button-group>
            <el-tooltip content="List view">
              <el-button
                size="small"
                :type="localViewMode === 'list' ? 'primary' : 'default'"
                :icon="ListIcon"
                @click="setViewMode('list')"
              />
            </el-tooltip>
            <el-tooltip content="Tree view">
              <el-button
                size="small"
                :type="localViewMode === 'tree' ? 'primary' : 'default'"
                :icon="CollectionIcon"
                @click="setViewMode('tree')"
              />
            </el-tooltip>
          </el-button-group>
        </div>
      </div>

      <div class="toolbar">
        <el-button-group>
          <el-tooltip content="New File">
            <el-button size="small" :icon="DocumentIcon" @click="handleNewFile" />
          </el-tooltip>
          <el-tooltip content="New Folder">
            <el-button size="small" :icon="FolderAddIcon" @click="handleNewFolder" />
          </el-tooltip>
          <el-tooltip content="Upload">
            <el-button size="small" :icon="UploadIcon" @click="triggerFileUpload" />
          </el-tooltip>
          <el-tooltip content="Refresh">
            <el-button size="small" :icon="RefreshIcon" @click="emit('refresh')" />
          </el-tooltip>
        </el-button-group>
      </div>
    </div>

    <div class="breadcrumb-container">
      <el-breadcrumb separator="/">
        <el-breadcrumb-item @click="navigateTo('.')">
          <el-icon><FolderIcon /></el-icon>
        </el-breadcrumb-item>
        <el-breadcrumb-item
          v-for="(segment, index) in pathSegments"
          :key="segment + index"
          @click="navigateToSegment(index)"
        >
          {{ segment }}
        </el-breadcrumb-item>
      </el-breadcrumb>
    </div>

    <div v-if="localViewMode === 'list'" class="list-container" v-loading="props.loading">
      <div
        v-for="item in orderedItems"
        :key="item.path"
        class="file-item"
        :class="{ selected: currentSelection === item.path, directory: item.type === 'directory' }"
        @click="handleItemClick(item)"
        @dblclick="handleItemDoubleClick(item)"
        @contextmenu.prevent="currentSelection = item.path; emit('update:selectedPath', item.path)"
      >
        <div class="file-icon">
          <el-icon v-if="item.type === 'directory'">
            <FolderIcon />
          </el-icon>
          <el-icon v-else>
            <DocumentIcon />
          </el-icon>
        </div>
        <div class="file-info">
          <div class="file-name">{{ item.name }}</div>
          <div v-if="item.type === 'file'" class="file-meta">{{ formatSize(item.size) }}</div>
        </div>
        <div class="file-actions">
          <el-button-group size="small">
            <el-button :icon="EditIcon" size="small" @click.stop="handleRename(item)" />
            <el-button :icon="DeleteIcon" size="small" @click.stop="handleDelete(item)" />
          </el-button-group>
        </div>
      </div>

      <el-empty
        v-if="!props.loading && orderedItems.length === 0"
        description="No files in this directory"
      />
    </div>

    <div v-else class="tree-container" v-loading="props.loading">
      <el-tree
        :key="treeRenderKey"
        node-key="path"
        lazy
        highlight-current
        :props="treeProps"
        :load="loadTreeNode"
        :current-node-key="props.path"
        @node-click="handleTreeNodeClick"
      >
        <template #default="{ data }">
          <div class="tree-node">
            <el-icon><FolderIcon /></el-icon>
            <span>{{ data.name }}</span>
          </div>
        </template>
      </el-tree>
    </div>

    <input
      ref="fileInput"
      type="file"
      multiple
      style="display: none"
      webkitdirectory="false"
      @change="handleFileInputChange"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElMessageBox } from 'element-plus';
import {
  Document as DocumentIcon,
  Folder as FolderIcon,
  FolderAdd as FolderAddIcon,
  Upload as UploadIcon,
  Refresh as RefreshIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  List as ListIcon,
  Collection as CollectionIcon
} from '@element-plus/icons-vue';
import type { FileBase, FileEntry } from '@/services/files';
import * as filesService from '@/services/files';

interface Props {
  base: FileBase;
  path: string;
  items: FileEntry[];
  loading: boolean;
  selectedPath: string | null;
  viewMode?: 'list' | 'tree';
}

interface Emits {
  (e: 'update:base', value: FileBase): void;
  (e: 'update:path', value: string): void;
  (e: 'update:selectedPath', value: string | null): void;
  (e: 'update:viewMode', value: 'list' | 'tree'): void;
  (e: 'refresh'): void;
  (e: 'create-file', payload: { name: string; path: string }): void;
  (e: 'create-folder', payload: { name: string; path: string }): void;
  (e: 'rename', payload: { entry: FileEntry; newName: string; newPath: string }): void;
  (e: 'delete', payload: FileEntry): void;
  (e: 'upload', payload: { files: File[] }): void;
  (e: 'select', payload: FileEntry): void;
  (e: 'open', payload: FileEntry): void;
}

const props = withDefaults(defineProps<Props>(), {
  viewMode: 'list'
});

const emit = defineEmits<Emits>();

const localBase = ref<FileBase>(props.base);
const localViewMode = ref<'list' | 'tree'>(props.viewMode ?? 'list');
const currentSelection = ref<string | null>(props.selectedPath ?? null);
const treeRenderKey = ref(0);
const fileInput = ref<HTMLInputElement | null>(null);

const pathSegments = computed(() => {
  if (!props.path || props.path === '.') return [];
  return props.path.split('/').filter(Boolean);
});

const orderedItems = computed(() => {
  return [...props.items].sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'directory' ? -1 : 1;
    }
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
});

const treeProps = {
  label: 'name',
  children: 'children',
  isLeaf: (data: FileEntry) => data.hasChildren === false
};

watch(() => props.base, (value) => {
  if (value !== localBase.value) {
    localBase.value = value;
    treeRenderKey.value += 1;
  }
});

watch(() => props.viewMode, (value) => {
  if (value && value !== localViewMode.value) {
    localViewMode.value = value;
  }
});

watch(() => props.selectedPath, (value) => {
  currentSelection.value = value;
});

function setViewMode(mode: 'list' | 'tree') {
  if (localViewMode.value === mode) return;
  localViewMode.value = mode;
  emit('update:viewMode', mode);
}

function navigateTo(path: string) {
  emit('update:path', path);
  emit('update:selectedPath', null);
}

function navigateToSegment(index: number) {
  const path = pathSegments.value.slice(0, index + 1).join('/') || '.';
  navigateTo(path);
}

function handleItemClick(item: FileEntry) {
  currentSelection.value = item.path;
  emit('update:selectedPath', item.path);
  emit('select', item);
}

function handleItemDoubleClick(item: FileEntry) {
  if (item.type === 'directory') {
    navigateTo(item.path);
  } else {
    emit('open', item);
  }
}

async function handleBaseChange(value: FileBase) {
  if (value === props.base) {
    return;
  }

  const previous = localBase.value;

  if (value === 'root') {
    try {
      await ElMessageBox.confirm(
        'You are about to browse the project root directory. Be careful not to modify critical files.',
        'Warning',
        {
          confirmButtonText: 'Continue',
          cancelButtonText: 'Cancel',
          type: 'warning'
        }
      );
      localBase.value = value;
      emit('update:base', value);
      navigateTo('.');
    } catch {
      localBase.value = previous;
    }
  } else {
    localBase.value = value;
    emit('update:base', value);
    navigateTo('.');
  }
}

async function promptForName(title: string, defaultValue = ''): Promise<string | null> {
  try {
    const { value } = await ElMessageBox.prompt('Enter name:', title, {
      confirmButtonText: 'Confirm',
      cancelButtonText: 'Cancel',
      inputValue: defaultValue,
      inputPattern: /.+/,
      inputErrorMessage: 'Name is required'
    });
    return value.trim();
  } catch (error) {
    return null;
  }
}

async function handleNewFile() {
  const name = await promptForName('New File');
  if (!name) return;
  const targetPath = props.path === '.' ? name : `${props.path}/${name}`;
  emit('create-file', { name, path: targetPath });
}

async function handleNewFolder() {
  const name = await promptForName('New Folder');
  if (!name) return;
  const targetPath = props.path === '.' ? name : `${props.path}/${name}`;
  emit('create-folder', { name, path: targetPath });
}

async function handleRename(entry: FileEntry) {
  const newName = await promptForName('Rename', entry.name);
  if (!newName || newName === entry.name) return;
  const parent = entry.path.includes('/') ? entry.path.slice(0, entry.path.lastIndexOf('/')) : '.';
  const newPath = parent === '.' ? newName : `${parent}/${newName}`;
  emit('rename', { entry, newName, newPath });
}

async function handleDelete(entry: FileEntry) {
  try {
    await ElMessageBox.confirm(
      `Delete "${entry.name}"? This action cannot be undone.`,
      'Delete',
      {
        confirmButtonText: 'Delete',
        cancelButtonText: 'Cancel',
        type: 'error'
      }
    );
    emit('delete', entry);
  } catch {
    // ignore cancel
  }
}

function triggerFileUpload() {
  fileInput.value?.click();
}

function handleFileInputChange(event: Event) {
  const target = event.target as HTMLInputElement;
  if (!target.files || target.files.length === 0) return;
  const files = Array.from(target.files);
  emit('upload', { files });
  target.value = '';
}

async function loadTreeNode(node: any, resolve: (data: FileEntry[]) => void) {
  const targetPath: string = node.level === 0 ? '.' : node.data.path;
  try {
    const response = await filesService.listFiles(localBase.value, targetPath);
    const directories = response.items.filter((item) => item.type === 'directory');
    resolve(directories);
  } catch {
    resolve([]);
  }
}

function handleTreeNodeClick(data: FileEntry) {
  navigateTo(data.path);
}

function formatSize(bytes: number): string {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  const value = bytes / Math.pow(k, i);
  return `${value % 1 === 0 ? value : value.toFixed(1)} ${sizes[i]}`;
}
</script>

<style scoped>
.file-explorer {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--surface);
  border-radius: 0.75rem;
  border: 1px solid var(--border-subtle);
  overflow: hidden;
}

.explorer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  background: var(--surface-strong);
  border-bottom: 1px solid var(--border-subtle);
  gap: 1rem;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex: 1;
}

.base-selector {
  min-width: 180px;
}

.view-toggle {
  display: flex;
  align-items: center;
}

.root-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.toolbar {
  display: flex;
  align-items: center;
}

.breadcrumb-container {
  padding: 0.5rem 1rem;
  background: var(--surface-subtle);
  border-bottom: 1px solid var(--border-subtle);
}

.breadcrumb-container :deep(.el-breadcrumb__item) {
  cursor: pointer;
}

.list-container {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem;
}

.file-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: background 0.15s;
}

.file-item:hover {
  background: var(--surface-subtle);
}

.file-item.selected {
  background: rgba(59, 130, 246, 0.15);
}

.file-item.directory .file-name {
  font-weight: 500;
}

.file-icon {
  display: flex;
  align-items: center;
  font-size: 1.25rem;
  color: var(--primary);
}

.file-info {
  flex: 1;
  min-width: 0;
}

.file-name {
  font-size: 0.9rem;
  color: var(--text-emphasis);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-meta {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.file-actions {
  opacity: 0;
  transition: opacity 0.15s;
}

.file-item:hover .file-actions {
  opacity: 1;
}

.tree-container {
  flex: 1;
  padding: 0.5rem 0.75rem;
  overflow-y: auto;
}

.tree-node {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
</style>
