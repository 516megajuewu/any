<template>
  <div class="dashboard-grid">
    <draggable
      v-model="localApps"
      class="grid"
      item-key="id"
      :animation="200"
      handle=".app-card"
      @end="onDragEnd"
    >
      <template #item="{ element }">
        <div class="grid-item">
          <app-card
            :app="element"
            @action="onAction"
            @command="onCommand"
            @open-file="onOpenFile"
            @open-console="onOpenConsole"
          />
        </div>
      </template>
    </draggable>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import Draggable from 'vuedraggable';
import AppCard from './AppCard.vue';
import { useAppsStore } from '@/stores/apps';
import type { AppModel } from '@/stores/apps';

const props = defineProps({
  apps: {
    type: Array as () => AppModel[],
    required: true
  }
});

const emit = defineEmits(['order-change', 'action', 'command', 'open-file', 'open-console']);

const appsStore = useAppsStore();

const localApps = computed({
  get() {
    return props.apps;
  },
  set(value: AppModel[]) {
    const order = value.map((app) => app.id);
    appsStore.setOrder(order);
    emit('order-change', order);
  }
});

const onDragEnd = () => {
  const order = localApps.value.map((app: AppModel) => app.id);
  appsStore.setOrder(order);
  emit('order-change', order);
};

const onAction = (payload: { action: string; id: string }) => {
  emit('action', payload);
};

const onCommand = (payload: { command: string; id: string }) => {
  emit('command', payload);
};

const onOpenFile = (id: string) => {
  emit('open-file', id);
};

const onOpenConsole = (id: string) => {
  emit('open-console', id);
};
</script>

<style scoped>
.dashboard-grid {
  width: 100%;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 1.5rem;
}

.grid-item {
  display: flex;
  flex-direction: column;
}

@media (max-width: 640px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
