import { h } from 'vue';
import { ElMessage, ElNotification } from 'element-plus';

export interface NotificationOptions {
  title?: string;
  message: string;
  type?: 'success' | 'warning' | 'info' | 'error';
  duration?: number;
  showClose?: boolean;
  action?: {
    label: string;
    handler: () => void;
  };
}

export interface RetryableError extends Error {
  retry?: () => Promise<void>;
}

class NotificationManager {
  private retryCallbacks = new Map<string, () => Promise<void>>();

  success(message: string, options?: Omit<NotificationOptions, 'message' | 'type'>) {
    return ElMessage({
      message,
      type: 'success',
      duration: 3000,
      showClose: true,
      ...options
    });
  }

  error(message: string, options?: Omit<NotificationOptions, 'message' | 'type'>) {
    return ElMessage({
      message,
      type: 'error',
      duration: 5000,
      showClose: true,
      ...options
    });
  }

  warning(message: string, options?: Omit<NotificationOptions, 'message' | 'type'>) {
    return ElMessage({
      message,
      type: 'warning',
      duration: 4000,
      showClose: true,
      ...options
    });
  }

  info(message: string, options?: Omit<NotificationOptions, 'message' | 'type'>) {
    return ElMessage({
      message,
      type: 'info',
      duration: 4000,
      showClose: true,
      ...options
    });
  }

  retryableError(error: RetryableError, options?: Omit<NotificationOptions, 'message' | 'type'>) {
    const id = `retry-${Date.now()}-${Math.random()}`;
    
    if (error.retry) {
      this.retryCallbacks.set(id, error.retry);
    }

    return ElNotification({
      title: options?.title || 'Error',
      message: error.message,
      type: 'error',
      duration: 0,
      showClose: true,
      ...(error.retry && {
        customClass: 'retryable-notification',
        message: h('div', [
          h('p', error.message),
          h('el-button', {
            type: 'primary',
            size: 'small',
            onClick: () => {
              const retry = this.retryCallbacks.get(id);
              if (retry) {
                retry().catch((err) => {
                  this.error(`Retry failed: ${err.message}`);
                });
              }
            }
          }, 'Retry')
        ])
      })
    });
  }

  persistent(options: NotificationOptions) {
    return ElNotification({
      title: options.title,
      message: options.message,
      type: options.type || 'info',
      duration: 0,
      showClose: true,
      ...(options.action && {
        message: h('div', [
          h('p', options.message),
          h('el-button', {
            type: 'primary',
            size: 'small',
            onClick: options.action.handler
          }, options.action.label)
        ])
      })
    });
  }

  clear() {
    ElMessage.closeAll();
    ElNotification.closeAll();
  }
}

export const notificationManager = new NotificationManager();

export function useNotifications() {
  return {
    success: notificationManager.success.bind(notificationManager),
    error: notificationManager.error.bind(notificationManager),
    warning: notificationManager.warning.bind(notificationManager),
    info: notificationManager.info.bind(notificationManager),
    retryableError: notificationManager.retryableError.bind(notificationManager),
    persistent: notificationManager.persistent.bind(notificationManager),
    clear: notificationManager.clear.bind(notificationManager)
  };
}
