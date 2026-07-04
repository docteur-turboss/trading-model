import { API_CLIENT } from "../api/api-client";
import type { JobDetail, JobList } from "../types/dtos";
import { useApi } from "./use-api";

/** Fetch the job list from the API. */
export function useJobs() {
	return useApi<JobList>(() => API_CLIENT.getJobs());
}

/** Fetch a single job's detail by ID; returns null when id is null. */
export function useJobDetail(id: string | null) {
	return useApi<JobDetail | null>(
		() => (id ? API_CLIENT.getJobDetail(id) : Promise.resolve(null)),
		[id]
	);
}
