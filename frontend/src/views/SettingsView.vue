<template>
  <div class="settings-view">
    <div class="settings-header">
      <h1>Settings</h1>
      <p class="subtitle">Configure your development environment</p>
    </div>

    <LoadingSkeleton v-if="loading" type="card" :rows="3" rowHeight="150px" />

    <div v-else class="settings-content">
      <div class="settings-section">
        <h2>Package Managers</h2>
        <div class="settings-grid">
          <div class="setting-item">
            <label for="node-pm">Node Package Manager</label>
            <select id="node-pm" v-model="settings.pkgManagers.node" @change="handleChange">
              <option value="npm">npm</option>
              <option value="yarn">yarn</option>
              <option value="pnpm">pnpm</option>
            </select>
          </div>

          <div class="setting-item">
            <label for="python-pm">Python Package Manager</label>
            <select id="python-pm" v-model="settings.pkgManagers.python" @change="handleChange">
              <option value="pip">pip</option>
              <option value="pip3">pip3</option>
              <option value="poetry">poetry</option>
            </select>
          </div>

          <div class="setting-item full-width">
            <label for="pip-index">Custom PyPI Index URL (optional)</label>
            <input
              id="pip-index"
              v-model="settings.pipIndex"
              type="text"
              placeholder="https://pypi.org/simple"
              @input="handleChange"
            />
            <small class="hint">Leave empty to use default PyPI index</small>
          </div>
        </div>
      </div>

      <div class="settings-section">
        <h2>UI Preferences</h2>
        <div class="settings-grid">
          <div class="setting-item">
            <label for="theme">Theme</label>
            <select id="theme" v-model="settings.ui.theme" @change="handleThemeChange">
              <option value="dark">Dark</option>
              <option value="light">Light</option>
              <option value="auto">Auto</option>
            </select>
          </div>
        </div>
      </div>

      <div class="settings-section">
        <h2>File Browser</h2>
        <div class="settings-grid">
          <div class="setting-item full-width">
            <label class="checkbox-label">
              <input
                v-model="settings.allowRootBrowse"
                type="checkbox"
                @change="handleChange"
              />
              <span>Allow browsing outside project root</span>
            </label>
            <small class="hint">Warning: This may expose sensitive system files</small>
          </div>
        </div>
      </div>

      <div class="settings-section">
        <h2>Security</h2>
        <div class="settings-grid">
          <div class="setting-item full-width">
            <label for="auth-token">Authentication Token (optional)</label>
            <input
              id="auth-token"
              v-model="settings.authToken"
              type="password"
              placeholder="Leave empty to disable authentication"
              @input="handleChange"
            />
            <small class="hint">Currently disabled. Future feature for API access control.</small>
          </div>
        </div>
      </div>

      <div class="settings-actions">
        <button class="btn-save" :disabled="!hasChanges || saving" @click="saveSettings">
          {{ saving ? 'Saving...' : 'Save Changes' }}
        </button>
        <button class="btn-reset" :disabled="!hasChanges" @click="resetSettings">
          Reset
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { useNotifications } from '@/composables/useNotifications';
import LoadingSkeleton from '@/components/LoadingSkeleton.vue';

interface Settings {
  ui: {
    theme?: string;
  };
  pkgManagers: {
    node: string;
    python: string;
  };
  pipIndex: string | null;
  allowRootBrowse: boolean;
  authToken: string | null;
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const notifications = useNotifications();

const loading = ref(true);
const saving = ref(false);
const hasChanges = ref(false);
const settings = ref<Settings>({
  ui: { theme: 'dark' },
  pkgManagers: { node: 'npm', python: 'pip' },
  pipIndex: null,
  allowRootBrowse: false,
  authToken: null
});
const originalSettings = ref<Settings | null>(null);

async function loadSettings() {
  loading.value = true;
  try {
    const response = await fetch(`${API_URL}/api/settings`);
    if (!response.ok) {
      throw new Error('Failed to load settings');
    }
    const data = await response.json();
    settings.value = {
      ui: data.ui || { theme: 'dark' },
      pkgManagers: data.pkgManagers || { node: 'npm', python: 'pip' },
      pipIndex: data.pipIndex ?? null,
      allowRootBrowse: data.allowRootBrowse ?? false,
      authToken: data.authToken ?? null
    };
    originalSettings.value = JSON.parse(JSON.stringify(settings.value));
  } catch (error) {
    notifications.error('Failed to load settings');
    console.error(error);
  } finally {
    loading.value = false;
  }
}

async function saveSettings() {
  saving.value = true;
  try {
    const response = await fetch(`${API_URL}/api/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings.value)
    });
    if (!response.ok) {
      throw new Error('Failed to save settings');
    }
    const data = await response.json();
    settings.value = data;
    originalSettings.value = JSON.parse(JSON.stringify(settings.value));
    hasChanges.value = false;
    notifications.success('Settings saved successfully');
  } catch (error) {
    notifications.error('Failed to save settings');
    console.error(error);
  } finally {
    saving.value = false;
  }
}

function handleChange() {
  hasChanges.value = JSON.stringify(settings.value) !== JSON.stringify(originalSettings.value);
}

function handleThemeChange() {
  handleChange();
  applyTheme(settings.value.ui.theme || 'dark');
}

function applyTheme(theme: string) {
  const effectiveTheme = theme === 'auto'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : theme;
  document.documentElement.setAttribute('data-theme', effectiveTheme);
}

function resetSettings() {
  if (originalSettings.value) {
    settings.value = JSON.parse(JSON.stringify(originalSettings.value));
    hasChanges.value = false;
    applyTheme(settings.value.ui.theme || 'dark');
  }
}

onMounted(() => {
  loadSettings();
});

watch(() => settings.value.ui.theme, (newTheme) => {
  if (newTheme) {
    applyTheme(newTheme);
  }
}, { immediate: true });
</script>

<style scoped>
.settings-view {
  max-width: 900px;
  margin: 0 auto;
  padding: 2rem;
}

.settings-header {
  margin-bottom: 2rem;
}

.settings-header h1 {
  font-size: 2rem;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 0.5rem;
}

.subtitle {
  color: var(--text-muted);
  font-size: 1rem;
}

.settings-content {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.settings-section {
  background: var(--bg-secondary);
  border: 1px solid var(--border-default);
  border-radius: 0.75rem;
  padding: 1.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  transition: all 0.2s ease;
}

.settings-section:hover {
  border-color: var(--border-subtle);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.settings-section h2 {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 1.5rem;
}

.settings-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1.5rem;
}

.setting-item {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.setting-item.full-width {
  grid-column: 1 / -1;
}

.setting-item label {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-secondary);
}

.setting-item input[type="text"],
.setting-item input[type="password"],
.setting-item select {
  padding: 0.625rem 0.875rem;
  background: var(--bg-primary);
  border: 1px solid var(--border-subtle);
  border-radius: 0.5rem;
  color: var(--text-primary);
  font-size: 0.875rem;
  transition: all 0.2s ease;
}

.setting-item input[type="text"]:focus,
.setting-item input[type="password"]:focus,
.setting-item select:focus {
  outline: none;
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 3px var(--accent-light);
}

.setting-item input[type="text"]:hover,
.setting-item input[type="password"]:hover,
.setting-item select:hover {
  border-color: var(--border-default);
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  cursor: pointer;
}

.checkbox-label input[type="checkbox"] {
  width: 1.25rem;
  height: 1.25rem;
  cursor: pointer;
}

.checkbox-label span {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-primary);
}

.hint {
  font-size: 0.75rem;
  color: var(--text-muted);
  font-style: italic;
}

.settings-actions {
  display: flex;
  gap: 1rem;
  justify-content: flex-end;
  margin-top: 1rem;
}

.btn-save,
.btn-reset {
  padding: 0.75rem 1.5rem;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}

.btn-save {
  background: var(--accent-primary);
  color: white;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.btn-save:hover:not(:disabled) {
  background: var(--accent-hover);
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
}

.btn-save:active:not(:disabled) {
  transform: translateY(0);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.btn-save:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.btn-reset {
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border: 1px solid var(--border-default);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.btn-reset:hover:not(:disabled) {
  background: var(--bg-hover);
  border-color: var(--border-subtle);
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.btn-reset:active:not(:disabled) {
  transform: translateY(0);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.btn-reset:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
