import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: '/apps'
    },
    {
      path: '/apps',
      name: 'apps',
      component: () => import('@/views/AppsDashboard.vue')
    },
    {
      path: '/files',
      name: 'files',
      component: () => import('@/views/FilesView.vue')
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/views/SettingsView.vue')
    }
  ]
});

export default router;
