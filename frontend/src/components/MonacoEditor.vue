<template>
  <div class="monaco-editor-wrapper">
    <div class="editor-toolbar">
      <div class="toolbar-left">
        <span v-if="filePath" class="file-path">{{ filePath }}</span>
        <el-tag v-if="isDirty" type="warning" effect="plain" size="small">Unsaved changes</el-tag>
      </div>
      <div class="toolbar-right">
        <el-button
          v-if="isDirty"
          type="primary"
          size="small"
          :icon="SaveIcon"
          @click="handleSave"
          :loading="saving"
        >
          Save (Ctrl+S)
        </el-button>
      </div>
    </div>
    <div ref="editorContainer" class="editor-container" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, shallowRef, markRaw } from 'vue';
import { ElMessage } from 'element-plus';
import type * as MonacoType from 'monaco-editor';
import { Save as SaveIcon } from '@element-plus/icons-vue';

interface Props {
  modelValue: string;
  filePath?: string;
  language?: string;
  readOnly?: boolean;
}

interface SavePayload {
  content: string;
  resolve: (success: boolean) => void;
}

interface Emits {
  (e: 'update:modelValue', value: string): void;
  (e: 'save', payload: SavePayload): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const editorContainer = ref<HTMLElement | null>(null);
const editorInstance = shallowRef<MonacoType.editor.IStandaloneCodeEditor | null>(null);
const isDirty = ref(false);
const saving = ref(false);
const originalContent = ref('');

let monaco: typeof MonacoType | null = null;

const languageMap: Record<string, string> = {
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.json': 'json',
  '.html': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.sass': 'sass',
  '.less': 'less',
  '.py': 'python',
  '.md': 'markdown',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.xml': 'xml',
  '.sql': 'sql',
  '.sh': 'shell',
  '.bash': 'shell',
  '.vue': 'html'
};

function detectLanguage(filename?: string): string {
  if (!filename) return 'plaintext';

  const extension = filename.substring(filename.lastIndexOf('.')).toLowerCase();
  return languageMap[extension] || 'plaintext';
}

function updateEditorContent(content: string) {
  if (!editorInstance.value) return;

  const model = editorInstance.value.getModel();
  if (model) {
    const currentValue = model.getValue();
    if (currentValue !== content) {
      model.setValue(content);
      originalContent.value = content;
      isDirty.value = false;
    }
  }
}

async function handleSave() {
  if (!editorInstance.value || !isDirty.value || !monaco) return;

  const content = editorInstance.value.getValue();
  saving.value = true;

  return new Promise<void>((resolve, reject) => {
    emit('save', {
      content,
      resolve: (success: boolean) => {
        saving.value = false;
        if (success) {
          originalContent.value = content;
          isDirty.value = false;
          ElMessage.success('File saved successfully');
          resolve();
        } else {
          ElMessage.error('Failed to save file');
          reject(new Error('Save failed'));
        }
      }
    });
  });
}

function setupKeyboardShortcuts(editor: MonacoType.editor.IStandaloneCodeEditor, monacoInstance: typeof MonacoType) {
  editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyS, () => {
    handleSave();
  });
}

async function initializeMonaco() {
  if (!editorContainer.value) return;

  monaco = await import('monaco-editor');

  const lang = detectLanguage(props.filePath || props.language);

  const editor = monaco.editor.create(editorContainer.value, {
    value: props.modelValue,
    language: lang,
    theme: 'vs-dark',
    automaticLayout: true,
    minimap: { enabled: true },
    fontSize: 14,
    lineNumbers: 'on',
    scrollBeyondLastLine: false,
    readOnly: props.readOnly || false,
    tabSize: 2,
    insertSpaces: true,
    wordWrap: 'on',
    wrappingIndent: 'indent'
  });

  editorInstance.value = markRaw(editor);
  originalContent.value = props.modelValue;

  editor.onDidChangeModelContent(() => {
    const currentValue = editor.getValue();
    isDirty.value = currentValue !== originalContent.value;
    emit('update:modelValue', currentValue);
  });

  setupKeyboardShortcuts(editor, monaco);
}

onMounted(() => {
  initializeMonaco();
});

onBeforeUnmount(() => {
  if (editorInstance.value) {
    editorInstance.value.dispose();
    editorInstance.value = null;
  }
});

watch(() => props.modelValue, (newValue) => {
  if (editorInstance.value && !isDirty.value) {
    updateEditorContent(newValue);
  }
});

watch(() => props.filePath, (newPath, oldPath) => {
  if (!editorInstance.value) {
    return;
  }

  const model = editorInstance.value.getModel();
  if (newPath && model && monaco) {
    const newLang = detectLanguage(newPath);
    monaco.editor.setModelLanguage(model, newLang);
  }

  if (newPath !== oldPath) {
    updateEditorContent(props.modelValue);
  }
});

defineExpose({ handleSave });
</script>

<style scoped>
.monaco-editor-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
  border-radius: 0.75rem;
  overflow: hidden;
  background: var(--surface-stronger);
  border: 1px solid var(--border-subtle);
}

.editor-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  background: var(--surface-strong);
  border-bottom: 1px solid var(--border-subtle);
  gap: 1rem;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex: 1;
  min-width: 0;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.file-path {
  font-size: 0.875rem;
  color: var(--text-emphasis);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.editor-container {
  flex: 1;
  min-height: 0;
}
</style>
