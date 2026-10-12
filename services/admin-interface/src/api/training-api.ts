import type { TrainingAgentListResponse } from "../types/dtos";
import { request, toQuery } from "./_request";

export const trainingApi = {
	getTrainingAgents: () =>
		request<TrainingAgentListResponse>("GET", "/trainer/training-agents"),

	getTrainingAgentBySymbol: (symbol: string) =>
		request<{
			data: {
				symbol: string;
				agent: unknown;
				training: boolean;
				generation: number;
				generationContext: unknown;
			};
		}>("GET", `/trainer/training-agents/${encodeURIComponent(symbol)}`),

	getTrainingResults: (params?: { symbol?: string; generation?: number }) =>
		request<{ results: unknown[]; total: number }>(
			"GET",
			`/trainer/results${toQuery(params as Record<string, unknown>)}`
		),

	startTraining: () => request<void>("POST", "/trainer/start"),
	stopTraining: () => request<void>("POST", "/trainer/stop"),
};
