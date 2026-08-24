import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import { logger } from '@lark-apaas/client-toolkit/logger';

import type { CollectionName, DashboardData, Entity, WorkspaceState } from '../workspace-types';

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function request<T>(url: string, method = 'GET', body?: unknown): Promise<T> {
  try {
    const response = await axiosForBackend({ url, method, ...(body === undefined ? {} : { data: body }) });
    const payload = response.data as any;
    return (payload?.data ?? payload) as T;
  } catch (error: any) {
    logger.error('Barry 工作台请求失败', error);
    const status = Number(error?.response?.status ?? 500);
    const payload = error?.response?.data;
    throw new ApiError(payload?.message ?? payload?.error?.message ?? error?.message ?? `操作失败（${status}）`, status);
  }
}

export const api = {
  state: () => request<WorkspaceState>('/api/state'),
  dashboard: (date: string) => request<DashboardData>(`/api/dashboard?date=${encodeURIComponent(date)}`),
  readingDashboard: () => request<any>('/api/reading/dashboard'),
  readingCalendar: (month: string) => request<any>(`/api/reading/calendar?month=${encodeURIComponent(month)}`),
  syncReading: () => request<any>('/api/reading/sync', 'POST'),
  setReadingPreferences: (goalMinutes: number) => request<any>('/api/reading/preferences', 'PATCH', { goalMinutes }),
  xunjiStatus: () => request<any>('/api/xunji/status'),
  syncXunji: (input?: { startDate?: string; endDate?: string }) => request<any>('/api/xunji/sync', 'POST', input ?? {}),
  search: (query: string) => request<Entity[]>(`/api/search?q=${encodeURIComponent(query)}`),
  create: (collection: CollectionName, input: Record<string, any>) => request<Entity>(`/api/collections/${collection}`, 'POST', input),
  update: (collection: CollectionName, id: string, input: Record<string, any>) => request<Entity>(`/api/collections/${collection}/${id}`, 'PATCH', input),
  remove: (collection: CollectionName, id: string) => request<Entity>(`/api/collections/${collection}/${id}`, 'DELETE'),
  restore: (collection: CollectionName, id: string) => request<Entity>(`/api/collections/${collection}/${id}/restore`, 'POST'),
  permanentDelete: (collection: CollectionName, id: string) => request<void>(`/api/collections/${collection}/${id}/permanent`, 'DELETE'),
  completePlan: (id: string) => request<Entity>(`/api/plan-items/${id}/complete`, 'POST'),
  postponePlan: (id: string, date: string) => request<Entity>(`/api/plan-items/${id}/postpone`, 'POST', { date }),
  getReview: (date: string) => request<Entity | null>(`/api/daily-reviews/${date}`),
  setReview: (date: string, content: string) => request<Entity>(`/api/daily-reviews/${date}`, 'PUT', { content }),
  convertMemo: (id: string, collection: CollectionName, fields: Record<string, any>) => request<Entity>(`/api/quick-memos/${id}/convert`, 'POST', { collection, fields }),
  settings: () => request<Record<string, any>>('/api/settings'),
  saveSettings: (input: Record<string, any>) => request<Record<string, any>>('/api/settings', 'PUT', input),
  systemStatus: () => request<Record<string, any>>('/api/system/status'),
  exportState: () => request<WorkspaceState>('/api/export/state'),
};
