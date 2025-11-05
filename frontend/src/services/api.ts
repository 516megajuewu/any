import axios from 'axios';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV
  ? 'http://localhost:3000'
  : window.location.origin);

export const apiClient = axios.create({
  baseURL: apiBaseUrl,
  timeout: 10000
});

export async function fetchHealth() {
  const response = await apiClient.get('/health');
  return response.data;
}
