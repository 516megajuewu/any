<template>
  <div class="empty-state">
    <div class="empty-state__icon" v-if="icon">
      <component :is="icon" />
    </div>
    <div class="empty-state__illustration" v-else-if="illustration">
      <img :src="illustration" :alt="title" />
    </div>
    <h3 class="empty-state__title">{{ title }}</h3>
    <p class="empty-state__description" v-if="description">{{ description }}</p>
    <div class="empty-state__actions" v-if="$slots.actions">
      <slot name="actions"></slot>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  title: string;
  description?: string;
  icon?: any;
  illustration?: string;
}

defineProps<Props>();
</script>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 3rem 2rem;
  color: var(--text-muted);
  min-height: 200px;
}

.empty-state__icon {
  width: 64px;
  height: 64px;
  margin-bottom: 1rem;
  opacity: 0.6;
  color: var(--text-muted);
}

.empty-state__illustration {
  width: 120px;
  height: 120px;
  margin-bottom: 1rem;
  opacity: 0.4;
}

.empty-state__illustration img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.empty-state__title {
  font-size: 1.25rem;
  font-weight: 600;
  margin: 0 0 0.5rem 0;
  color: var(--text-secondary);
}

.empty-state__description {
  font-size: 0.875rem;
  margin: 0 0 1.5rem 0;
  max-width: 400px;
  line-height: 1.5;
}

.empty-state__actions {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
  justify-content: center;
}
</style>
