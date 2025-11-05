<template>
  <div class="settings-view">
    <div class="settings-header">
      <h1>Settings</h1>
      <p class="subtitle">Configure your development environment</p>
    </div>

    <div v-if="loading" class="loading-skeleton">
      <div class="skeleton-card"></div>
      <div class="skeleton-card"></div>
      <div class="skeleton-card"></div>
    </div>

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
import { ElMessage } from 'element-plus';

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
    ElMessage.error('Failed to load settings');
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
    ElMessage.success('Settings saved successfully');
  } catch (error) {
    ElMessage.error('Failed to save settings');
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

.loading-skeleton {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.skeleton-card {
  height: 150px;
  background: linear-gradient(90deg, var(--bg-secondary) 25%, var(--bg-tertiary) 50%, var(--bg-secondary) 75%);
  background-size: 200% 100%;
  animation: loading 1.5s infinite;
  border-radius: 0.75rem;
}

@keyframes loading {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

.settings-content {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.settings-section {
  background: var(--bg-secondary);
  border: 1px solid var(--border-subtle);
  border-radius: 0.75rem;
  padding: 1.5rem;
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
  transition: border-color 0.2s;
}

.setting-item input[type="text"]:focus,
.setting-item input[type="password"]:focus,
.setting-item select:focus {
  outline: none;
  border-color: var(--accent-primary);
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
}

.btn-save:hover:not(:disabled) {
  background: var(--accent-hover);
  transform: translateY(-1px);
}

.btn-save:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-reset {
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border: 1px solid var(--border-subtle);
}

.btn-reset:hover:not(:disabled) {
  background: var(--bg-secondary);
}

.btn-reset:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
