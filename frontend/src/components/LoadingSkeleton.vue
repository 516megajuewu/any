<template>
  <div class="skeleton-container">
    <div v-for="i in rows" :key="i" class="skeleton-row" :style="{ height: rowHeight }">
      <div class="skeleton-content" :class="skeletonClass"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  rows?: number;
  rowHeight?: string;
  type?: 'text' | 'card' | 'list' | 'table';
}

const props = withDefaults(defineProps<Props>(), {
  rows: 3,
  rowHeight: '1rem',
  type: 'text'
});

const skeletonClass = computed(() => ({
  'skeleton-text': props.type === 'text',
  'skeleton-card': props.type === 'card',
  'skeleton-list': props.type === 'list',
  'skeleton-table': props.type === 'table'
}));
</script>

<style scoped>
.skeleton-container {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.skeleton-row {
  display: flex;
  align-items: center;
}

.skeleton-content {
  width: 100%;
  background: linear-gradient(
    90deg,
    var(--bg-tertiary) 25%,
    var(--bg-hover) 50%,
    var(--bg-tertiary) 75%
  );
  background-size: 200% 100%;
  animation: loading 1.5s infinite;
  border-radius: 0.375rem;
}

.skeleton-card {
  height: 120px;
  border-radius: 0.75rem;
}

.skeleton-list {
  height: 3rem;
  border-radius: 0.5rem;
}

.skeleton-table {
  height: 2.5rem;
  border-radius: 0.375rem;
}

@keyframes loading {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}
</style>
