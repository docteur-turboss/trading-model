import type { CandleInterval } from "@trading-model/common/config/event.types";
import { HTTP_HEADERS } from "@trading-model/common/http-headers";

import type {
	AdminAuditFilter,
	CacheEntryList,
	Candle,
	CertificateEntry,
	ConfigEntry,
	DlqMessageList,
	JobDetail,
	JobList,
	OrderBook,
	PaginatedEvents,
	PaginatedResults,
	ServiceRegistry,
	StatsSummary,
	Ticker,
	TrainingFilter,
	WorkerList,
} from "../types/dtos";
import { ApiError } from "../types/dtos";

const API_BASE = import.meta.env.VITE_API_GATEWAY_URL ?? "/v1";

let adminToken = import.meta.env.VITE_ADMIN_TOKEN ?? "";

export function setAdminToken(token: string) {
	adminToken = token;
}

function toQuery(params?: Record<string, unknown>): string {
	if (!params) {
		return "";
	}
	const entries = Object.entries(params).filter(
		([, value]) => value !== undefined && value !== null && value !== ""
	);
	if (entries.length === 0) {
		return "";
	}
	return `?${entries.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`).join("&")}`;
}

async function request<TData>(
	method: string,
	path: string,
	body?: unknown
): Promise<TData> {
	const res = await fetch(`${API_BASE}${path}`, {
		method,
		headers: {
			[HTTP_HEADERS.CONTENT_TYPE]: "application/json",
			[HTTP_HEADERS.X_API_KEY]: adminToken,
		},
		body: body ? JSON.stringify(body) : undefined,
	});
	if (!res.ok) {
		const err = await res.json().catch(() => ({ error: res.statusText }));
		throw new ApiError(
			res.status,
			(err as { error?: string }).error ?? "Unknown error"
		);
	}
	return res.json() as Promise<TData>;
}

export const API_CLIENT = {
	getServices: () => request<ServiceRegistry>("GET", "/discovery/registry"),
	banInstance: (name: string, id: string) =>
		request<void>("DELETE", `/discovery/services/${name}/instances/${id}`),

	getAuditEvents: (params?: AdminAuditFilter) =>
		request<PaginatedEvents>(
			"GET",
			`/audit/events${toQuery(params as Record<string, unknown>)}`
		),

	getJobs: () => request<JobList>("GET", "/jobs"),
	getJobDetail: (id: string) => request<JobDetail>("GET", `/jobs/${id}`),
	cancelJob: (id: string) =>
		request<void>("PATCH", `/jobs/${id}/status`, { status: "cancelled" }),

	getDlqMessages: () => request<DlqMessageList>("GET", "/messages/dlq"),
	purgeDlq: () => request<void>("DELETE", "/messages/dlq"),
	retryDlqMessage: (id: string) =>
		request<void>("POST", `/messages/dlq/${id}/retry`),

	getTrainingResults: (params?: TrainingFilter) =>
		request<PaginatedResults>(
			"GET",
			`/trainer/results${toQuery(params as Record<string, unknown>)}`
		),
	startTraining: () => request<void>("POST", "/trainer/start"),
	stopTraining: () => request<void>("POST", "/trainer/stop"),

	getCacheEntries: () => request<CacheEntryList>("GET", "/gateway/cache"),
	invalidateCache: (key?: string) =>
		key
			? request<void>("DELETE", `/gateway/cache/${key}`)
			: request<void>("DELETE", "/gateway/cache"),

	getWorkers: () => request<WorkerList>("GET", "/jobs/workers"),
	drainWorker: (id: string) =>
		request<void>("PATCH", `/workers/${id}/status`, { status: "draining" }),

	getCandles: (symbol: string, interval: CandleInterval) =>
		request<Candle[]>(
			"GET",
			`/scraper/candles?symbol=${symbol}&interval=${interval}`
		),
	getTickers: (symbol: string) =>
		request<Ticker>("GET", `/scraper/tickers/${symbol}`),
	getOrderBook: (symbol: string) =>
		request<OrderBook>("GET", `/scraper/orderbook/${symbol}`),

	getConfig: (service?: string) =>
		request<ConfigEntry[]>(
			"GET",
			`/discovery/config${service ? `/${service}` : ""}`
		),

	getCertificates: () => request<CertificateEntry[]>("GET", "/ca/certificates"),
	revokeCertificate: (id: string) =>
		request<void>("POST", "/ca/revoke", { certificateId: id }),

	getStats: () => request<StatsSummary>("GET", "/discovery/stats"),
};
