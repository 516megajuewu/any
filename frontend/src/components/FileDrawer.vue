<template>
  <el-drawer :model-value="isOpen" title="Files" size="40%" @close="close">
    <el-empty description="File browser coming soon" image-size="140">
      <template #description>
        <p>Connect the file service to explore project files.</p>
      </template>
    </el-empty>
  </el-drawer>
</template>

<script setup lang="ts">
import { withDefaults } from 'vue';

withDefaults(defineProps<{
  isOpen: boolean;
}>(), {
  isOpen: false
});

const emit = defineEmits(['close']);

const close = () => {
  emit('close');
};
</script>
