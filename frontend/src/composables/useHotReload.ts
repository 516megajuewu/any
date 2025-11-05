import { inject, onMounted, onBeforeUnmount } from 'vue';
import { ElMessage } from 'element-plus';
import type { WebSocketClient } from '@/stores/apps';

export function useHotReload() {
  const eventsClient = inject<WebSocketClient>('eventsClient');
  let unsubscribe: (() => void) | null = null;

  const handleHotReload = (message: any) => {
    if (!message || typeof message !== 'object') {
      return;
    }

    if (message.type === 'core:reloaded') {
      const { info } = message;
      const summary = info?.summary || 'Core modules reloaded';
      const changedFiles = info?.changedFiles || [];
      
      const filesList = changedFiles.length > 0
        ? `\n${changedFiles.slice(0, 3).map((f: any) => f.path).join('\n')}${changedFiles.length > 3 ? `\n...and ${changedFiles.length - 3} more` : ''}`
        : '';

      ElMessage({
        message: `${summary}${filesList}`,
        type: 'success',
        duration: 4000,
        showClose: true
      });
    }
  };

  onMounted(() => {
    if (eventsClient) {
      unsubscribe = eventsClient.on('message', handleHotReload);
    }
  });

  onBeforeUnmount(() => {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  });

  return {};
}
