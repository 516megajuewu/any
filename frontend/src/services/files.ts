import type { AxiosRequestConfig } from 'axios';
import { apiClient } from './api';

export type FileBase = 'apps' | 'root';
export type FileType = 'file' | 'directory';

export interface FileEntry {
  name: string;
  path: string;
  type: FileType;
  size: number;
  mtime: string;
  ctime: string;
  hasChildren?: boolean;
}

export interface FileListResponse {
  base: FileBase;
  path: string;
  items: FileEntry[];
}

export interface UploadSummaryItem {
  name: string;
  type: FileType;
  path: string;
  renamedFrom?: string;
  skipped?: boolean;
}

export interface UploadResponse {
  success: boolean;
  base: FileBase;
  targetPath: string;
  strategy: UploadStrategy;
  items: UploadSummaryItem[];
}

export type UploadStrategy = 'replace' | 'skip' | 'rename';

export interface UploadOptions {
  base: FileBase;
  targetPath: string;
  strategy: UploadStrategy;
  files: File[];
}

export async function listFiles(base: FileBase, targetPath: string): Promise<FileListResponse> {
  const response = await apiClient.get<FileListResponse>('/api/files', {
    params: {
      base,
      path: targetPath
    }
  });
  return response.data;
}

export async function readFileContent(base: FileBase, targetPath: string, config?: AxiosRequestConfig) {
  const response = await apiClient.get<{ content: string }>('/api/files/content', {
    params: { base, path: targetPath },
    ...config
  });
  return response.data.content;
}

export async function writeFileContent(base: FileBase, targetPath: string, content: string) {
  return apiClient.post('/api/files/content', { base, path: targetPath, content });
}

export async function createDirectory(base: FileBase, targetPath: string) {
  return apiClient.post('/api/files/mkdir', { base, path: targetPath });
}

export async function renamePath(base: FileBase, src: string, dest: string, overwrite = false) {
  return apiClient.post('/api/files/rename', { base, src, dest, overwrite });
}

export async function removePath(base: FileBase, targetPath: string) {
  return apiClient.delete('/api/files', {
    params: { base, path: targetPath }
  });
}

export async function uploadFile(
  base: FileBase,
  targetPath: string,
  file: File,
  strategy: UploadStrategy,
  createFolder: boolean
) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('base', base);
  formData.append('path', targetPath);
  formData.append('strategy', strategy);
  formData.append('createFolder', String(createFolder));

  const response = await apiClient.post<UploadResponse>('/api/files/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });

  return response.data;
}

export async function uploadFiles(options: UploadOptions): Promise<UploadResponse[]> {
  const { base, targetPath, strategy, files } = options;
  const createFolder = files.length === 1 && !files[0].name.toLowerCase().endsWith('.zip');
  const results: UploadResponse[] = [];

  for (const file of files) {
    const result = await uploadFile(base, targetPath, file, strategy, createFolder);
    results.push(result);
  }

  return results;
}
