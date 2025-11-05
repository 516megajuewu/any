<template>
  <div class="file-explorer">
    <div class="explorer-header">
      <div class="header-left">
        <div class="base-selector">
          <el-select v-model="localBase" size="small" @change="handleBaseChange">
            <el-option label="Apps Directory" value="apps" />
            <el-option
              label="Project Root"
              value="root"
              :disabled="!props.allowRootAccess"
            >
              <div class="root-option">
                <span>Project Root</span>
                <el-tag
                  v-if="props.allowRootAccess"
                  type="warning"
                  size="small"
                  effect="plain"
                >
                  ⚠ Careful
                </el-tag>
                <el-tag
                  v-else
                  type="info"
                  size="small"
                  effect="plain"
                >
                  Disabled
                </el-tag>
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
      <div class="header-right">
        <el-input
          v-model="localSearch"
          size="small"
          placeholder="Search files"
          clearable
          class="search-input"
        >
          <template #prefix>
            <el-icon><SearchIcon /></el-icon>
          </template>
        </el-input>
        <div class="toolbar">
          <el-button-group>
            <el-tooltip content="New File">
              <el-button
                size="small"
                :icon="DocumentIcon"
                :disabled="!canMutate"
                @click="handleNewFile"
              />
            </el-tooltip>
            <el-tooltip content="New Folder">
              <el-button
                size="small"
                :icon="FolderAddIcon"
                :disabled="!canMutate"
                @click="handleNewFolder"
              />
            </el-tooltip>
            <el-tooltip content="Upload">
              <el-button
                size="small"
                :icon="UploadIcon"
                :disabled="!canMutate"
                @click="triggerFileUpload"
              />
            </el-tooltip>
            <el-tooltip content="Refresh">
              <el-button size="small" :icon="RefreshIcon" @click="emit('refresh')" />
            </el-tooltip>
          </el-button-group>
        </div>
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

    <div v-if="localViewMode === 'list'" class="list-wrapper" v-loading="props.loading">
      <el-table
        :data="displayedItems"
        row-key="path"
        class="file-table"
        :border="false"
        size="small"
        height="100%"
        highlight-current-row
        :row-class-name="rowClassName"
        @row-click="handleRowClick"
        @row-dblclick="handleRowDoubleClick"
        @row-contextmenu.prevent="handleRowContextMenu"
      >
        <el-table-column prop="name" label="Name" min-width="220">
          <template #default="{ row }">
            <div class="cell-name">
              <el-icon class="cell-icon">
                <FolderIcon v-if="row.type === 'directory'" />
                <DocumentIcon v-else />
              </el-icon>
              <span class="cell-text">{{ row.name }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="Size" width="120" align="right">
          <template #default="{ row }">
            <span>{{ row.type === 'file' ? formatSize(row.size) : 'Folder' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="Modified" width="200">
          <template #default="{ row }">
            <span>{{ formatDate(row.mtime) }}</span>
          </template>
        </el-table-column>
        <el-table-column width="120" align="right">
          <template #default="{ row }">
            <el-button-group size="small">
              <el-button
                :icon="EditIcon"
                size="small"
                :disabled="!canMutate"
                @click.stop="handleRename(row)"
              />
              <el-button
                :icon="DeleteIcon"
                size="small"
                type="danger"
                plain
                :disabled="!canMutate"
                @click.stop="handleDelete(row)"
              />
            </el-button-group>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty description="No files in this directory" />
        </template>
      </el-table>
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
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  Document as DocumentIcon,
  Folder as FolderIcon,
  FolderAdd as FolderAddIcon,
  Upload as UploadIcon,
  Refresh as RefreshIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  List as ListIcon,
  Collection as CollectionIcon,
  Search as SearchIcon
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
  searchQuery?: string;
  allowRootAccess?: boolean;
  allowMutations?: boolean;
}

interface Emits {
  (e: 'update:base', value: FileBase): void;
  (e: 'update:path', value: string): void;
  (e: 'update:selectedPath', value: string | null): void;
  (e: 'update:viewMode', value: 'list' | 'tree'): void;
  (e: 'update:searchQuery', value: string): void;
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
  viewMode: 'list',
  searchQuery: '',
  allowRootAccess: false,
  allowMutations: true
});

const emit = defineEmits<Emits>();

const localBase = ref<FileBase>(props.base);
const localViewMode = ref<'list' | 'tree'>(props.viewMode ?? 'list');
const localSearch = ref(props.searchQuery ?? '');
const currentSelection = ref<string | null>(props.selectedPath ?? null);
const treeRenderKey = ref(0);
const fileInput = ref<HTMLInputElement | null>(null);

const canMutate = computed(() => props.allowMutations !== false);

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

const displayedItems = computed(() => {
  const query = localSearch.value.trim().toLowerCase();
  if (!query) {
    return orderedItems.value;
  }
  return orderedItems.value.filter((item) => item.name.toLowerCase().includes(query));
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

watch(() => props.searchQuery, (value) => {
  const normalized = value ?? '';
  if (normalized !== localSearch.value) {
    localSearch.value = normalized;
  }
});

watch(localSearch, (value) => {
  if (value !== props.searchQuery) {
    emit('update:searchQuery', value);
  }
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

function handleRowClick(row: FileEntry) {
  currentSelection.value = row.path;
  emit('update:selectedPath', row.path);
  emit('select', row);
}

function handleRowDoubleClick(row: FileEntry) {
  if (row.type === 'directory') {
    navigateTo(row.path);
  } else {
    emit('open', row);
  }
}

function handleRowContextMenu(row: FileEntry) {
  currentSelection.value = row.path;
  emit('update:selectedPath', row.path);
}


async function handleBaseChange(value: FileBase) {
  if (value === props.base) {
    return;
  }

  const previous = localBase.value;

  if (value === 'root') {
    if (!props.allowRootAccess) {
      ElMessage.warning('Project root access is disabled.');
      localBase.value = previous;
      return;
    }

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
  if (!canMutate.value) return;
  const name = await promptForName('New File');
  if (!name) return;
  const targetPath = props.path === '.' ? name : `${props.path}/${name}`;
  emit('create-file', { name, path: targetPath });
}

async function handleNewFolder() {
  if (!canMutate.value) return;
  const name = await promptForName('New Folder');
  if (!name) return;
  const targetPath = props.path === '.' ? name : `${props.path}/${name}`;
  emit('create-folder', { name, path: targetPath });
}

async function handleRename(entry: FileEntry) {
  if (!canMutate.value) return;
  const newName = await promptForName('Rename', entry.name);
  if (!newName || newName === entry.name) return;
  const parent = entry.path.includes('/') ? entry.path.slice(0, entry.path.lastIndexOf('/')) : '.';
  const newPath = parent === '.' ? newName : `${parent}/${newName}`;
  emit('rename', { entry, newName, newPath });
}

async function handleDelete(entry: FileEntry) {
  if (!canMutate.value) return;
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
  if (!canMutate.value) return;
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

function formatDate(value: string | Date | number | undefined): string {
  if (!value) {
    return '—';
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toLocaleString();
}

function rowClassName({ row }: { row: FileEntry }) {
  return row.path === currentSelection.value ? 'is-selected-row' : '';
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
  flex-wrap: wrap;
}

.header-left,
.header-right {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.base-selector {
  min-width: 180px;
}

.search-input {
  width: 220px;
}

.toolbar {
  display: flex;
  align-items: center;
}

.root-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: 0.5rem;
}

.breadcrumb-container {
  padding: 0.5rem 1rem;
  background: var(--surface-subtle);
  border-bottom: 1px solid var(--border-subtle);
}

.breadcrumb-container :deep(.el-breadcrumb__item) {
  cursor: pointer;
}

.list-wrapper {
  flex: 1;
  min-height: 0;
  padding: 0.25rem 0.75rem 0.75rem;
}

.file-table {
  width: 100%;
  height: 100%;
  background: transparent;
}

.file-table :deep(.el-table__inner-wrapper) {
  border-radius: 0.5rem;
  overflow: hidden;
  border: 1px solid var(--border-subtle);
  background: var(--surface);
}

.file-table :deep(.el-table__header th) {
  background: var(--surface-strong);
  color: var(--text-muted);
  border-color: var(--border-subtle);
}

.file-table :deep(.el-table__body td) {
  border-color: var(--border-subtle);
  background: transparent;
  color: var(--text-emphasis);
}

.file-table :deep(.el-table__body tr:hover > td) {
  background: rgba(59, 130, 246, 0.08);
}

.file-table :deep(.is-selected-row > td) {
  background: rgba(59, 130, 246, 0.15) !important;
}

.cell-name {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.cell-icon {
  font-size: 1.1rem;
  color: var(--primary);
}

.cell-text {
  font-size: 0.9rem;
  color: var(--text-emphasis);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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

@media (max-width: 720px) {
  .explorer-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .search-input {
    width: 100%;
  }
}
</style>
