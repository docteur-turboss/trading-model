import { useApi } from './use-api';
import { api } from '../api/api-client';
import type { AuditFilter, PaginatedEvents } from '../types/dtos';

/** Fetch paginated audit events with optional filters. */
export function useAuditEvents(params?: AuditFilter) {
  return useApi<PaginatedEvents>(() => api.getAuditEvents(params), [JSON.stringify(params)]);
}
