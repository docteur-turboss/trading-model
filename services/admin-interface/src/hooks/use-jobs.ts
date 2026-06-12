import { useApi } from './use-api';
import { api } from '../api/api-client';
import type { JobList, JobDetail } from '../types/dtos';

/** Fetch the job list from the API. */
export function useJobs() {
  return useApi<JobList>(() => api.getJobs());
}

/** Fetch a single job's detail by ID; returns null when id is null. */
export function useJobDetail(id: string | null) {
  return useApi<JobDetail | null>(() => (id ? api.getJobDetail(id) : Promise.resolve(null)), [id]);
}
