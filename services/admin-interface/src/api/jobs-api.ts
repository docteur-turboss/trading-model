import type { JobDetail, JobList, WorkerList } from "../types/dtos";
import { request } from "./_request";

export const jobsApi = {
	getJobs: () => request<JobList>("GET", "/jobs"),
	getJobDetail: (id: string) => request<JobDetail>("GET", `/jobs/${id}`),
	cancelJob: (id: string) =>
		request<void>("PATCH", `/jobs/${id}/status`, { status: "cancelled" }),

	getWorkers: () => request<WorkerList>("GET", "/jobs/workers"),
	drainWorker: (id: string) =>
		request<void>("PATCH", `/workers/${id}/status`, { status: "draining" }),
};
