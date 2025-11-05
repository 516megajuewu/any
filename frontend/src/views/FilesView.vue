<template>
  <div class="files-view">
    <el-card shadow="never" class="files-card">
      <template #header>
        <div class="card-header">
          <span>File explorer</span>
          <el-tag type="info" effect="light">Placeholder</el-tag>
        </div>
      </template>

      <el-empty
        description="Connect the file service to browse repository files"
        image-size="160"
      />

      <p class="hint">
        The backend exposes safe file helpers through <code>core/fileService.js</code>.
        Wire this view to list directories and manage project assets.
      </p>
    </el-card>
  </div>
</template>

<script setup lang="ts">
</script>

<style scoped>
.files-view {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.files-card {
  border-radius: 1rem;
  background: var(--surface);
  color: var(--text-muted);
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--text-emphasis);
}

.hint {
  margin-top: 1.5rem;
  color: var(--text-muted);
}
</style>
