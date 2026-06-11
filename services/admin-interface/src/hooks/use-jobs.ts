import { useApi } from './use-api';
import { api } from '../api/api-client';
import type { JobList, JobDetail } from '../types/dtos';

export function useJobs() {
  return useApi<JobList>(() => api.getJobs());
}

export function useJobDetail(id: string | null) {
  return useApi<JobDetail | null>(() => (id ? api.getJobDetail(id) : Promise.resolve(null)), [id]);
}
