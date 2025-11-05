import { defineStore } from 'pinia';
import type { FileBase, FileEntry } from '@/services/files';

export const DIRECTORY_CACHE_TTL = 30 * 1000;
export const CONTENT_CACHE_TTL = 30 * 1000;

const STORAGE_KEY = 'file-browser-state-v1';
const MAX_RECENT_FILES = 10;

type ViewMode = 'list' | 'tree';

interface DirectoryCacheEntry {
  items: FileEntry[];
  timestamp: number;
}

interface ContentCacheEntry {
  content: string;
  timestamp: number;
}

export interface RecentFileEntry {
  base: FileBase;
  path: string;
  name: string;
  openedAt: number;
}

export interface OpenFileState {
  base: FileBase;
  path: string;
  name: string;
  content: string;
  lastSavedContent: string;
  dirty: boolean;
}

interface PersistedState {
  base: FileBase;
  path: string;
  selectedPath: string | null;
  viewMode: ViewMode;
  openFile: OpenFileState | null;
  recentlyOpened: RecentFileEntry[];
  searchQuery: string;
}

interface FileBrowserState {
  base: FileBase;
  path: string;
  selectedPath: string | null;
  viewMode: ViewMode;
  items: FileEntry[];
  loading: boolean;
  error: string | null;
  directoriesCache: Record<string, DirectoryCacheEntry>;
  contentCache: Record<string, ContentCacheEntry>;
  openFile: OpenFileState | null;
  recentlyOpened: RecentFileEntry[];
  allowRootBrowsing: boolean;
  allowRootMutations: boolean;
  searchQuery: string;
  initialized: boolean;
  lastAppId: string | null;
}

function makeCacheKey(base: FileBase, path: string) {
  return `${base}:${path || '.'}`;
}

export const useFileBrowserStore = defineStore('fileBrowser', {
  state: (): FileBrowserState => ({
    base: 'apps',
    path: '.',
    selectedPath: null,
    viewMode: 'list',
    items: [],
    loading: false,
    error: null,
    directoriesCache: {},
    contentCache: {},
    openFile: null,
    recentlyOpened: [],
    allowRootBrowsing: false,
    allowRootMutations: false,
    searchQuery: '',
    initialized: false,
    lastAppId: null
  }),
  getters: {
    filteredItems(state): FileEntry[] {
      if (!state.searchQuery) {
        return state.items;
      }
      const query = state.searchQuery.toLowerCase();
      return state.items.filter((item) => item.name.toLowerCase().includes(query));
    },
    hasUnsavedChanges(state): boolean {
      return Boolean(state.openFile?.dirty);
    },
    currentCacheKey(state): string {
      return makeCacheKey(state.base, state.path);
    }
  },
  actions: {
    initializeFromStorage() {
      if (this.initialized) {
        return;
      }
      this.initialized = true;

      if (typeof window === 'undefined') {
        return;
      }

      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) {
          return;
        }

        const parsed = JSON.parse(raw) as Partial<PersistedState> | null;
        if (!parsed) {
          return;
        }

        if (parsed.base === 'apps' || parsed.base === 'root') {
          this.base = parsed.base;
        }
        if (typeof parsed.path === 'string' && parsed.path) {
          this.path = parsed.path;
        }
        if (typeof parsed.selectedPath === 'string' || parsed.selectedPath === null) {
          this.selectedPath = parsed.selectedPath;
        }
        if (parsed.viewMode === 'list' || parsed.viewMode === 'tree') {
          this.viewMode = parsed.viewMode;
        }
        if (Array.isArray(parsed.recentlyOpened)) {
          this.recentlyOpened = parsed.recentlyOpened
            .filter((item): item is RecentFileEntry => Boolean(item && item.base && item.path && item.name))
            .slice(0, MAX_RECENT_FILES);
        }
        if (typeof parsed.searchQuery === 'string') {
          this.searchQuery = parsed.searchQuery;
        }
        if (parsed.openFile && parsed.openFile.path && parsed.openFile.base) {
          this.openFile = {
            base: parsed.openFile.base,
            path: parsed.openFile.path,
            name: parsed.openFile.name,
            content: parsed.openFile.content,
            lastSavedContent: parsed.openFile.lastSavedContent,
            dirty: Boolean(parsed.openFile.dirty)
          };
          this.selectedPath = parsed.openFile.path;
        }
      } catch (error) {
        console.warn('Failed to restore file browser state', error);
      }
    },
    persistState() {
      if (typeof window === 'undefined') {
        return;
      }

      const payload: PersistedState = {
        base: this.base,
        path: this.path,
        selectedPath: this.selectedPath,
        viewMode: this.viewMode,
        openFile: this.openFile,
        recentlyOpened: this.recentlyOpened.slice(0, MAX_RECENT_FILES),
        searchQuery: this.searchQuery
      };

      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } catch (error) {
        console.warn('Failed to persist file browser state', error);
      }
    },
    setPermissions(options: { allowRootBrowsing?: boolean; allowRootMutations?: boolean }) {
      if (typeof options.allowRootBrowsing === 'boolean') {
        this.allowRootBrowsing = options.allowRootBrowsing;
      }
      if (typeof options.allowRootMutations === 'boolean') {
        this.allowRootMutations = options.allowRootMutations;
      }
    },
    setBase(base: FileBase) {
      if (this.base !== base) {
        this.base = base;
        this.persistState();
      }
    },
    setPath(path: string) {
      const normalized = path && path !== '' ? path : '.';
      if (this.path !== normalized) {
        this.path = normalized;
        this.persistState();
      }
    },
    setSelectedPath(path: string | null) {
      this.selectedPath = path;
      this.persistState();
    },
    setViewMode(mode: ViewMode) {
      if (this.viewMode !== mode) {
        this.viewMode = mode;
        this.persistState();
      }
    },
    setLoading(value: boolean) {
      this.loading = value;
    },
    setError(message: string | null) {
      this.error = message;
    },
    setItems(items: FileEntry[]) {
      this.items = items;
    },
    setSearchQuery(query: string) {
      this.searchQuery = query;
      this.persistState();
    },
    cacheDirectory(base: FileBase, path: string, items: FileEntry[]) {
      const key = makeCacheKey(base, path);
      this.directoriesCache[key] = { items, timestamp: Date.now() };
    },
    getCachedDirectory(base: FileBase, path: string) {
      const key = makeCacheKey(base, path);
      return this.directoriesCache[key] ?? null;
    },
    invalidateDirectoryCache(base: FileBase, path?: string) {
      if (path) {
        delete this.directoriesCache[makeCacheKey(base, path)];
        return;
      }

      Object.keys(this.directoriesCache).forEach((key) => {
        if (key.startsWith(`${base}:`)) {
          delete this.directoriesCache[key];
        }
      });
    },
    cacheFileContent(base: FileBase, path: string, content: string) {
      const key = makeCacheKey(base, path);
      this.contentCache[key] = { content, timestamp: Date.now() };
    },
    getCachedFileContent(base: FileBase, path: string) {
      const key = makeCacheKey(base, path);
      return this.contentCache[key] ?? null;
    },
    invalidateFileContent(base: FileBase, path: string) {
      delete this.contentCache[makeCacheKey(base, path)];
    },
    setOpenFile(payload: { base: FileBase; path: string; name: string; content: string }) {
      this.openFile = {
        base: payload.base,
        path: payload.path,
        name: payload.name,
        content: payload.content,
        lastSavedContent: payload.content,
        dirty: false
      };
      this.selectedPath = payload.path;
      this.cacheFileContent(payload.base, payload.path, payload.content);
      this.persistState();
    },
    updateOpenFileContent(content: string) {
      if (!this.openFile) {
        return;
      }
      this.openFile.content = content;
      this.openFile.dirty = content !== this.openFile.lastSavedContent;
      this.cacheFileContent(this.openFile.base, this.openFile.path, content);
      this.persistState();
    },
    markOpenFileSaved(content: string) {
      if (!this.openFile) {
        return;
      }
      this.openFile.content = content;
      this.openFile.lastSavedContent = content;
      this.openFile.dirty = false;
      this.cacheFileContent(this.openFile.base, this.openFile.path, content);
      this.persistState();
    },
    updateOpenFileMetadata(payload: { path?: string; name?: string; base?: FileBase }) {
      if (!this.openFile) {
        return;
      }
      if (payload.base && payload.base !== this.openFile.base) {
        this.openFile.base = payload.base;
      }
      if (payload.path) {
        this.openFile.path = payload.path;
      }
      if (payload.name) {
        this.openFile.name = payload.name;
      }
      this.persistState();
    },
    closeOpenFile() {
      this.openFile = null;
      this.persistState();
    },
    addRecentlyOpened(entry: { base: FileBase; path: string; name: string }) {
      const existingIndex = this.recentlyOpened.findIndex((item) => item.base === entry.base && item.path === entry.path);
      if (existingIndex !== -1) {
        this.recentlyOpened.splice(existingIndex, 1);
      }
      this.recentlyOpened.unshift({
        base: entry.base,
        path: entry.path,
        name: entry.name,
        openedAt: Date.now()
      });
      if (this.recentlyOpened.length > MAX_RECENT_FILES) {
        this.recentlyOpened.length = MAX_RECENT_FILES;
      }
      this.persistState();
    },
    setLastAppId(appId: string | null) {
      this.lastAppId = appId;
    }
  }
});
