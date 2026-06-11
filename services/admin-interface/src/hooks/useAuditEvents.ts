import { useApi } from './useApi';
import { api } from '../api/api-client';
import type { AuditFilter, PaginatedEvents } from '../types/dtos';

export function useAuditEvents(params?: AuditFilter) {
  return useApi<PaginatedEvents>(() => api.getAuditEvents(params), [JSON.stringify(params)]);
}
