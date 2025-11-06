import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useAppStore } from '@/stores/app';
import { useNotifications } from './useNotifications';

export function useWebSocketStatus() {
  const appStore = useAppStore();
  const notifications = useNotifications();
  
  const reconnectAttempts = ref(0);
  const maxReconnectAttempts = 5;
  const baseReconnectDelay = 1000;
  const maxReconnectDelay = 30000;
  
  let reconnectTimeout: number | null = null;
  let isManualDisconnect = false;

  const isConnected = computed(() => appStore.isEventStreamConnected);
  const isHealthy = computed(() => appStore.isBackendHealthy);
  const connectionStatus = computed(() => {
    if (isConnected.value && isHealthy.value) return 'online';
    if (isHealthy.value) return 'degraded';
    return 'offline';
  });

  const statusText = computed(() => {
    switch (connectionStatus.value) {
      case 'online': return 'Connected';
      case 'degraded': return 'Reconnecting...';
      case 'offline': return 'Disconnected';
      default: return 'Unknown';
    }
  });

  const shouldShowReconnectButton = computed(() => {
    return connectionStatus.value === 'offline' || (connectionStatus.value === 'degraded' && reconnectAttempts.value >= maxReconnectAttempts);
  });

  function calculateBackoffDelay(attempt: number): number {
    const exponentialDelay = baseReconnectDelay * Math.pow(2, attempt);
    const jitter = Math.random() * 0.1 * exponentialDelay;
    return Math.min(exponentialDelay + jitter, maxReconnectDelay);
  }

  function scheduleReconnect() {
    if (isManualDisconnect || reconnectAttempts.value >= maxReconnectAttempts) {
      return;
    }

    const delay = calculateBackoffDelay(reconnectAttempts.value);
    
    reconnectTimeout = window.setTimeout(() => {
      reconnectAttempts.value++;
      attemptReconnect();
    }, delay);
  }

  function attemptReconnect() {
    if (isManualDisconnect) return;

    notifications.info(`Attempting to reconnect... (${reconnectAttempts.value}/${maxReconnectAttempts})`, {
      duration: 2000
    });

    // Trigger a reconnection by forcing a health check
    window.location.reload();
  }

  function manualReconnect() {
    reconnectAttempts.value = 0;
    isManualDisconnect = false;
    
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }

    notifications.info('Manually reconnecting...', {
      duration: 2000
    });

    attemptReconnect();
  }

  function disconnect() {
    isManualDisconnect = true;
    
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }

    reconnectAttempts.value = 0;
    appStore.setEventStreamStatus('disconnected');
  }

  function resetConnectionState() {
    reconnectAttempts.value = 0;
    isManualDisconnect = false;
    
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }
  }

  // Monitor connection status changes
  onMounted(() => {
    // Add connection status change handling
    const checkConnection = () => {
      const currentStatus = connectionStatus.value;
      
      if (currentStatus === 'offline' && !isManualDisconnect) {
        scheduleReconnect();
      } else if (currentStatus === 'online') {
        resetConnectionState();
        if (reconnectAttempts.value > 0) {
          notifications.success('Connection restored');
        }
      }
    };

    // Initial check
    checkConnection();

    // Set up interval to check connection
    const interval = setInterval(checkConnection, 5000);

    onBeforeUnmount(() => {
      clearInterval(interval);
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
    });
  });

  return {
    isConnected,
    isHealthy,
    connectionStatus,
    statusText,
    shouldShowReconnectButton,
    reconnectAttempts,
    maxReconnectAttempts,
    manualReconnect,
    disconnect,
    resetConnectionState
  };
}
