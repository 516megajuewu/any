import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import './style.css';
import './styles/theme.css';

import { useAppStore } from '@/stores/app';
import { createEventsClient } from '@/services/events';
import { fetchHealth } from '@/services/api';

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(router);
app.use(ElementPlus);

const appStore = useAppStore(pinia);

async function refreshHealthStatus() {
  try {
    await fetchHealth();
    appStore.setHealthStatus('online');
  } catch (error) {
    console.error('Health check failed', error);
    appStore.setHealthStatus('offline');
  }
}

refreshHealthStatus();

const eventsClient = createEventsClient();
app.provide('eventsClient', eventsClient);

appStore.setEventStreamStatus('connecting');

eventsClient.on('open', () => {
  appStore.setEventStreamStatus('connected');
});

eventsClient.on('close', () => {
  appStore.setEventStreamStatus('disconnected');
});

eventsClient.on('message', (message) => {
  const data = message as { type?: string } | undefined;
  const type = typeof data?.type === 'string' ? data.type : 'message';

  appStore.pushEvent({
    type,
    payload: message,
    receivedAt: Date.now()
  });
});

eventsClient.on('error', (error) => {
  console.warn('WebSocket error', error);
});

app.mount('#app');
