import { computed, ref } from 'vue';
import type { AxiosError } from 'axios';
import { ElMessage } from 'element-plus';
import { storeToRefs } from 'pinia';
import type { FileBase, FileEntry, UploadStrategy } from '@/services/files';
import * as fileService from '@/services/files';
import { apiClient } from '@/services/api';
import { useFileBrowserStore, DIRECTORY_CACHE_TTL, CONTENT_CACHE_TTL } from '@/stores/fileBrowser';
import { useAppsStore, type AppModel } from '@/stores/apps';

interface DirectoryCacheEntry {
  items: FileEntry[];
  timestamp: number;
}

interface ContentCacheEntry {
  content: string;
  timestamp: number;
}

interface LoadOptions {
  force?: boolean;
  base?: FileBase;
}

interface InitializeOptions {
  force?: boolean;
}

function normalizePath(targetPath: string | null | undefined): string {
  if (!targetPath || targetPath === '.' || targetPath === '/') {
    return '.';
  }
  const trimmed = targetPath.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+/g, '/');
  return trimmed === '' ? '.' : trimmed;
}

function extractErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'string') {
    return error;
  }
  const axiosError = error as AxiosError<{ error?: string }>;
  const responseMessage = axiosError?.response?.data?.error;
  if (responseMessage) {
    return responseMessage;
  }
  if (axiosError?.message) {
    return axiosError.message;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

function sanitizeErrorMessage(message: string, fallback: string): string {
  if (!message) {
    return fallback;
  }
  if (message.toLowerCase().includes('outside of the allowed directory')) {
    return 'Access denied: that path is not permitted.';
  }
  return message;
}

function createFileEntry(name: string, path: string, type: FileEntry['type']): FileEntry {
  const now = new Date().toISOString();
  return {
    name,
    path,
    type,
    size: type === 'file' ? 0 : 0,
    mtime: now,
    ctime: now,
    hasChildren: type === 'directory' ? false : undefined
  };
}

function deriveCandidatePaths(app: AppModel | null | undefined, currentPath: string): string[] {
  if (!app) {
    return [currentPath];
  }
  const candidates: string[] = [];

  if (currentPath && currentPath !== '.') {
    candidates.push(currentPath);
  }

  const normalizedCwd = (app.cwd || '').replace(/\\/g, '/');
  const appsIndex = normalizedCwd.indexOf('/apps/');
  if (appsIndex !== -1) {
    const relative = normalizedCwd.slice(appsIndex + '/apps/'.length);
    if (relative) {
      candidates.push(relative);
    }
  }

  if (app.id) {
    candidates.push(app.id);
  }

  if (app.name) {
    const slug = app.name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (slug) {
      candidates.push(slug);
    }
  }

  candidates.push('.');

  return Array.from(new Set(candidates.filter(Boolean).map((item) => normalizePath(item))));
}

export function useFileBrowser() {
  const fileStore = useFileBrowserStore();
  const appsStore = useAppsStore();

  fileStore.initializeFromStorage();

  const {
    base,
    path,
    filteredItems,
    items,
    loading,
    viewMode,
    searchQuery,
    openFile,
    recentlyOpened,
    selectedPath
  } = storeToRefs(fileStore);

  const error = computed(() => fileStore.error);
  const allowRootBrowsing = computed(() => fileStore.allowRootBrowsing);
  const allowRootMutations = computed(() => fileStore.allowRootMutations);
  const hasUnsavedChanges = computed(() => fileStore.hasUnsavedChanges);

  const initializingApp = ref(false);
  const permissionsLoaded = ref(false);

  async function ensurePermissionsLoaded() {
    if (permissionsLoaded.value) {
      return;
    }
    permissionsLoaded.value = true;
    try {
      const response = await apiClient.get('/api/settings');
      const ui = response.data?.ui ?? {};
      const filesUi = ui.files ?? ui.fileBrowser ?? {};
      const allowBrowsing = Boolean(filesUi.allowProjectRoot ?? filesUi.allowRootAccess ?? ui.allowProjectRootBrowsing ?? false);
      const allowMutations = Boolean(filesUi.allowRootMutations ?? filesUi.allowRootWrite ?? ui.allowProjectRootChanges ?? false);
      fileStore.setPermissions({ allowRootBrowsing: allowBrowsing, allowRootMutations: allowMutations });
    } catch (err) {
      console.warn('Failed to load settings for file browser', err);
      fileStore.setPermissions({ allowRootBrowsing: false, allowRootMutations: false });
    }
  }

  function handleError(errorLike: unknown, fallback: string) {
    const rawMessage = extractErrorMessage(errorLike, fallback);
    const message = sanitizeErrorMessage(rawMessage, fallback);
    fileStore.setError(message);
    ElMessage.error(message);
  }

  function shouldUseDirectoryCache(entry: DirectoryCacheEntry | null, force = false) {
    if (!entry || force) {
      return false;
    }
    return Date.now() - entry.timestamp < DIRECTORY_CACHE_TTL;
  }

  function shouldUseContentCache(entry: ContentCacheEntry | null, force = false) {
    if (!entry || force) {
      return false;
    }
    return Date.now() - entry.timestamp < CONTENT_CACHE_TTL;
  }

  async function fetchDirectory(targetPath?: string, options: LoadOptions = {}) {
    const normalizedPath = normalizePath(targetPath ?? fileStore.path);
    const baseToUse = options.base ?? fileStore.base;
    const useCache = !options.force && options.base === undefined;

    if (useCache) {
      const cached = fileStore.getCachedDirectory(baseToUse, normalizedPath) as DirectoryCacheEntry | null;
      if (shouldUseDirectoryCache(cached, options.force)) {
        fileStore.setBase(baseToUse);
        fileStore.setPath(normalizedPath);
        fileStore.setItems(cached.items);
        fileStore.setError(null);
        fileStore.setLoading(false);
        return cached.items;
      }
    }

    const previousBase = fileStore.base;
    if (baseToUse !== fileStore.base) {
      fileStore.setBase(baseToUse);
    }

    fileStore.setLoading(true);
    fileStore.setError(null);

    try {
      const result = await fileService.listFiles(baseToUse, normalizedPath);
      fileStore.setPath(result.path || normalizedPath);
      fileStore.setItems(result.items);
      fileStore.cacheDirectory(baseToUse, result.path || normalizedPath, result.items);
      fileStore.setError(null);
      return result.items;
    } catch (err) {
      if (options.base !== undefined && previousBase !== baseToUse) {
        fileStore.setBase(previousBase);
      }
      handleError(err, 'Failed to load directory');
      throw err;
    } finally {
      fileStore.setLoading(false);
    }
  }

  function setSearchQueryLocal(query: string) {
    fileStore.setSearchQuery(query);
  }

  function setViewModeLocal(mode: 'list' | 'tree') {
    fileStore.setViewMode(mode);
  }

  function selectPathLocal(value: string | null) {
    fileStore.setSelectedPath(value);
  }

  async function changeBase(baseValue: FileBase, options: { resetPath?: boolean } = {}) {
    await ensurePermissionsLoaded();
    if (baseValue === 'root' && !fileStore.allowRootBrowsing) {
      ElMessage.error('Project root browsing is disabled by settings.');
      return false;
    }

    const targetPath = options.resetPath ? '.' : fileStore.path;
    try {
      await fetchDirectory(targetPath, { force: true, base: baseValue });
      fileStore.setBase(baseValue);
      if (options.resetPath) {
        fileStore.setPath('.');
      }
      fileStore.invalidateDirectoryCache(baseValue);
      return true;
    } catch (errorLike) {
      if (baseValue !== fileStore.base) {
        await fetchDirectory(fileStore.path, { force: true, base: fileStore.base });
      }
      return false;
    }
  }

  async function changePath(targetPath: string, options: { force?: boolean } = {}) {
    const normalizedPath = normalizePath(targetPath);
    await fetchDirectory(normalizedPath, { force: options.force });
  }

  async function openEntry(entry: FileEntry, options: { force?: boolean } = {}) {
    if (entry.type === 'directory') {
      await changePath(entry.path, { force: options.force });
      return null;
    }

    const cached = fileStore.getCachedFileContent(fileStore.base, entry.path) as ContentCacheEntry | null;
    if (shouldUseContentCache(cached, options.force ?? false)) {
      fileStore.setOpenFile({
        base: fileStore.base,
        path: entry.path,
        name: entry.name,
        content: cached.content
      });
      fileStore.addRecentlyOpened({ base: fileStore.base, path: entry.path, name: entry.name });
      return cached.content;
    }

    try {
      const content = await fileService.readFileContent(fileStore.base, entry.path);
      fileStore.setOpenFile({
        base: fileStore.base,
        path: entry.path,
        name: entry.name,
        content
      });
      fileStore.addRecentlyOpened({ base: fileStore.base, path: entry.path, name: entry.name });
      return content;
    } catch (err) {
      handleError(err, `Failed to open "${entry.name}"`);
      throw err;
    }
  }

  async function openFileByPath(targetPath: string, baseOverride?: FileBase) {
    const normalizedPath = normalizePath(targetPath);
    const targetBase = baseOverride ?? fileStore.base;

    if (targetBase !== fileStore.base) {
      const switched = await changeBase(targetBase, { resetPath: false });
      if (!switched) {
        return null;
      }
    }

    const existingEntry = fileStore.items.find((item) => item.path === normalizedPath);
    if (existingEntry) {
      return openEntry(existingEntry, { force: true });
    }

    const parent = normalizedPath.includes('/') ? normalizedPath.slice(0, normalizedPath.lastIndexOf('/')) : '.';
    await fetchDirectory(parent, { force: false });

    const refreshedEntry = fileStore.items.find((item) => item.path === normalizedPath);
    if (refreshedEntry) {
      return openEntry(refreshedEntry, { force: true });
    }

    try {
      const content = await fileService.readFileContent(targetBase, normalizedPath);
      const name = normalizedPath.split('/').pop() || normalizedPath;
      fileStore.setOpenFile({
        base: targetBase,
        path: normalizedPath,
        name,
        content
      });
      fileStore.addRecentlyOpened({ base: targetBase, path: normalizedPath, name });
      return content;
    } catch (err) {
      handleError(err, 'Failed to open file');
      throw err;
    }
  }

  function updateOpenFileContent(content: string) {
    fileStore.updateOpenFileContent(content);
  }

  function calculateSize(content: string): number {
    if (typeof Blob !== 'undefined') {
      return new Blob([content]).size;
    }
    if (typeof TextEncoder !== 'undefined') {
      return new TextEncoder().encode(content).length;
    }
    return content.length;
  }

  async function saveOpenFile(content?: string) {
    const current = fileStore.openFile;
    if (!current) {
      return false;
    }

    const payload = content ?? current.content;

    try {
      await fileService.writeFileContent(current.base, current.path, payload);
      fileStore.markOpenFileSaved(payload);

      const now = new Date().toISOString();
      const updatedItems = fileStore.items.map((item) => {
        if (item.path === current.path) {
          return {
            ...item,
            size: calculateSize(payload),
            mtime: now
          };
        }
        return item;
      });

      fileStore.setItems(updatedItems);
      fileStore.cacheDirectory(fileStore.base, fileStore.path, updatedItems);
      fileStore.invalidateDirectoryCache(current.base);
      return true;
    } catch (err) {
      handleError(err, `Failed to save "${current.name}"`);
      return false;
    }
  }

  async function createFile(name: string, targetPath?: string) {
    const normalizedName = name.trim();
    if (!normalizedName) {
      ElMessage.warning('File name is required.');
      return;
    }
    const target = normalizePath(targetPath ?? (fileStore.path === '.' ? normalizedName : `${fileStore.path}/${normalizedName}`));

    try {
      await fileService.writeFileContent(fileStore.base, target, '');
      const entry = createFileEntry(normalizedName, target, 'file');
      const updated = [...fileStore.items.filter((item) => item.path !== target), entry];
      fileStore.setItems(updated);
      fileStore.cacheDirectory(fileStore.base, fileStore.path, updated);
      fileStore.invalidateDirectoryCache(fileStore.base);
      ElMessage.success(`Created file "${normalizedName}"`);
      await fetchDirectory(fileStore.path, { force: true });
    } catch (err) {
      handleError(err, `Failed to create "${normalizedName}"`);
    }
  }

  async function createFolder(name: string, targetPath?: string) {
    const normalizedName = name.trim();
    if (!normalizedName) {
      ElMessage.warning('Folder name is required.');
      return;
    }
    const target = normalizePath(targetPath ?? (fileStore.path === '.' ? normalizedName : `${fileStore.path}/${normalizedName}`));

    try {
      await fileService.createDirectory(fileStore.base, target);
      const entry = createFileEntry(normalizedName, target, 'directory');
      const updated = [...fileStore.items.filter((item) => item.path !== target), entry];
      fileStore.setItems(updated);
      fileStore.cacheDirectory(fileStore.base, fileStore.path, updated);
      fileStore.invalidateDirectoryCache(fileStore.base);
      ElMessage.success(`Created folder "${normalizedName}"`);
      await fetchDirectory(fileStore.path, { force: true });
    } catch (err) {
      handleError(err, `Failed to create folder "${normalizedName}"`);
    }
  }

  async function renameEntry(entry: FileEntry, newPath: string) {
    const normalizedNewPath = normalizePath(newPath);
    try {
      await fileService.renamePath(fileStore.base, entry.path, normalizedNewPath);
      const newName = normalizedNewPath.split('/').pop() || entry.name;

      const updated = fileStore.items.map((item) => {
        if (item.path === entry.path) {
          return {
            ...item,
            name: newName,
            path: normalizedNewPath
          };
        }
        return item;
      });

      fileStore.setItems(updated);
      fileStore.cacheDirectory(fileStore.base, fileStore.path, updated);
      fileStore.invalidateDirectoryCache(fileStore.base);

      if (fileStore.openFile?.path === entry.path) {
        fileStore.updateOpenFileMetadata({ path: normalizedNewPath, name: newName });
      }

      ElMessage.success(`Renamed to "${newName}"`);
      await fetchDirectory(fileStore.path, { force: true });
    } catch (err) {
      handleError(err, 'Failed to rename path');
    }
  }

  async function deleteEntry(entry: FileEntry) {
    try {
      await fileService.removePath(fileStore.base, entry.path);
      const updated = fileStore.items.filter((item) => item.path !== entry.path);
      fileStore.setItems(updated);
      fileStore.cacheDirectory(fileStore.base, fileStore.path, updated);
      fileStore.invalidateDirectoryCache(fileStore.base);

      if (fileStore.openFile?.path === entry.path) {
        fileStore.closeOpenFile();
      }

      ElMessage.success(`Deleted "${entry.name}"`);
      await fetchDirectory(fileStore.path, { force: true });
    } catch (err) {
      handleError(err, 'Failed to delete');
    }
  }

  async function uploadFiles(files: File[], strategy: UploadStrategy) {
    if (!files || files.length === 0) {
      return;
    }

    try {
      const responses = await fileService.uploadFiles({
        base: fileStore.base,
        targetPath: fileStore.path,
        strategy,
        files
      });

      const uploadedCount = responses.filter((response) => response.success).length;
      const skippedCount = responses.filter((response) => response.skipped).length;

      if (uploadedCount > 0) {
        ElMessage.success(`Uploaded ${uploadedCount} file${uploadedCount === 1 ? '' : 's'}.`);
      }
      if (skippedCount > 0) {
        ElMessage.info(`${skippedCount} file${skippedCount === 1 ? '' : 's'} skipped.`);
      }

      fileStore.invalidateDirectoryCache(fileStore.base);
      await fetchDirectory(fileStore.path, { force: true });
    } catch (err) {
      handleError(err, 'Upload failed');
    }
  }

  async function initializeForApp(appId: string | null, options: InitializeOptions = {}) {
    await ensurePermissionsLoaded();

    if (!appId) {
      if (fileStore.base === 'root' && !fileStore.allowRootBrowsing) {
        fileStore.setBase('apps');
      }
      await fetchDirectory('.', { force: options.force, base: fileStore.base });
      fileStore.setLastAppId(null);
      return;
    }

    const app = appsStore.getAppById(appId);

    if (!app) {
      if (fileStore.base === 'root' && !fileStore.allowRootBrowsing) {
        fileStore.setBase('apps');
      }
      await fetchDirectory('.', { force: options.force, base: fileStore.base });
      fileStore.setLastAppId(null);
      return;
    }

    if (fileStore.lastAppId === appId && !options.force) {
      if (fileStore.items.length === 0) {
        await fetchDirectory(fileStore.path, { force: false });
      }
      return;
    }

    initializingApp.value = true;
    const candidates = deriveCandidatePaths(app, fileStore.path);

    for (const candidate of candidates) {
      try {
        await fetchDirectory(candidate, { force: true, base: 'apps' });
        fileStore.setLastAppId(appId);
        initializingApp.value = false;
        return;
      } catch (err) {
        // try next candidate
      }
    }

    initializingApp.value = false;
  }

  return {
    base,
    path,
    items,
    filteredItems,
    loading,
    viewMode,
    searchQuery,
    error,
    openFile,
    recentlyOpened,
    selectedPath,
    allowRootBrowsing,
    allowRootMutations,
    hasUnsavedChanges,
    initializingApp,
    ensurePermissionsLoaded,
    fetchDirectory,
    changeBase,
    changePath,
    selectPath: selectPathLocal,
    setViewMode: setViewModeLocal,
    setSearchQuery: setSearchQueryLocal,
    openEntry,
    openFileByPath,
    updateOpenFileContent,
    saveOpenFile,
    createFile,
    createFolder,
    renameEntry,
    deleteEntry,
    uploadFiles,
    refresh: () => fetchDirectory(fileStore.path, { force: true }),
    initializeForApp
  };
}
