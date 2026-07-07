import type { PaginatedResults, TrainingFilter } from "../types/dtos";
import { request, toQuery } from "./_request";

export const trainingApi = {
	getTrainingResults: (params?: TrainingFilter) =>
		request<PaginatedResults>(
			"GET",
			`/trainer/results${toQuery(params as Record<string, unknown>)}`
		),
	startTraining: () => request<void>("POST", "/trainer/start"),
	stopTraining: () => request<void>("POST", "/trainer/stop"),
};
