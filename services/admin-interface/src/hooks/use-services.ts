import { useApi } from './use-api';
import { api } from '../api/api-client';
import type { ServiceRegistry } from '../types/dtos';

export function useServices() {
  return useApi<ServiceRegistry>(() => api.getServices());
}
