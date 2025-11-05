<template>
  <section class="page-shell">
    <header class="page-shell__header" :class="{ 'has-actions': hasActions }">
      <div class="page-shell__heading">
        <div class="page-shell__title-block">
          <h1 class="page-shell__title">{{ title }}</h1>
          <p v-if="description" class="page-shell__description">{{ description }}</p>
        </div>
        <div v-if="$slots.meta" class="page-shell__meta">
          <slot name="meta" />
        </div>
      </div>
      <div v-if="hasActions" class="page-shell__actions">
        <slot name="actions" />
      </div>
    </header>

    <div :class="bodyClasses">
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, useSlots, withDefaults } from 'vue';

interface Props {
  title: string;
  description?: string;
  padded?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  padded: true
});

const slots = useSlots();

const hasActions = computed(() => Boolean(slots.actions));

const bodyClasses = computed(() => ({
  'page-shell__body': true,
  'page-shell__body--padded': props.padded
}));
</script>

<style scoped>
.page-shell {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.page-shell__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1.5rem;
  padding: 1.5rem 1.75rem;
  border-radius: 1.5rem;
  background: linear-gradient(160deg, rgba(30, 41, 59, 0.92), rgba(15, 23, 42, 0.88));
  border: 1px solid rgba(148, 163, 184, 0.12);
  box-shadow: 0 18px 48px rgba(15, 23, 42, 0.45);
}

.page-shell__heading {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  width: 100%;
}

.page-shell__title-block {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.page-shell__title {
  margin: 0;
  font-size: 1.85rem;
  font-weight: 600;
  color: var(--text-emphasis);
}

.page-shell__description {
  margin: 0;
  font-size: 0.95rem;
  color: var(--text-muted);
  max-width: 52ch;
}

.page-shell__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.page-shell__actions {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  justify-content: flex-end;
}

.page-shell__body {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.page-shell__body--padded {
  padding: 1.5rem;
  border-radius: 1.5rem;
  background: rgba(15, 23, 42, 0.65);
  border: 1px solid rgba(148, 163, 184, 0.12);
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.35);
}

@media (max-width: 960px) {
  .page-shell__header {
    flex-direction: column;
  }

  .page-shell__actions {
    width: 100%;
    justify-content: flex-start;
  }
}
</style>
