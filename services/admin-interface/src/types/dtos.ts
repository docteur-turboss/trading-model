import type {
	AuditEvent,
	AuditFilter,
	CacheEntry,
	DlqMessage,
	JobEntry,
	ServiceRegistryEntry,
	TopologyLink,
	TrainingResult,
	WorkerEntry,
	WorkerStats,
} from "@trading-model/common/contracts/admin";
import type {
	PaginationQuery,
	PaginationResult,
} from "@trading-model/common/domain/pagination";
import type {
	DurationMs,
	ISODateTime,
	Percentage,
	PositiveInt,
	Topic,
	TradingSymbol,
} from "@trading-model/common/domain/primitives";

export type {
	AdminServiceInstance,
	AuditEvent,
	AuditFilter,
	AuditVolumeByTopic,
	CacheEntry,
	CacheStats,
	Candle,
	CertificateEntry,
	ConfigEntry,
	DlqMessage,
	DlqStats,
	JobDetail,
	JobEntry,
	JobStats,
	JobTimelineEntry,
	ServiceRegistryEntry,
	Ticker,
	TopologyLink,
	TrainingGenome,
	TrainingLayer,
	TrainingResult,
	WorkerEntry,
	WorkerStats,
} from "@trading-model/common/contracts/admin";

export interface ServiceRegistry {
	services: ServiceRegistryEntry[];
	topology: TopologyLink[];
}

export interface StatsSummary {
	activeServices: PositiveInt;
	totalServices: PositiveInt;
	totalInstances: PositiveInt;
	errorsRate: Percentage;
	avgLatency: DurationMs;
}

export type OrderBookLevel =
	import("@trading-model/common/contracts/market-data.types").OrderBookLevel;

export interface OrderBook {
	bids: OrderBookLevel[];
	asks: OrderBookLevel[];
}

export interface AdminAuditFilter extends PaginationQuery, AuditFilter {
	search?: string;
}

export interface PaginatedEvents extends PaginationResult<AuditEvent> {
	volumeByTopic: { topic: Topic; count: number }[];
}

export interface JobList {
	jobs: JobEntry[];
	stats: { pending: PositiveInt; inProgress: PositiveInt; failed: PositiveInt };
}

export interface DlqMessageList {
	messages: DlqMessage[];
	stats: {
		pending: PositiveInt;
		retryRate: Percentage;
		totalSize: PositiveInt;
		lastIncident: ISODateTime;
	};
}

export interface PaginatedResults {
	results: TrainingResult[];
	total: PositiveInt;
}

export interface TrainingFilter {
	symbol?: TradingSymbol;
	generation?: PositiveInt;
}

export interface CacheEntryList {
	entries: CacheEntry[];
	stats: { hitRate: Percentage; activeEntries: PositiveInt };
}

export interface WorkerList {
	workers: WorkerEntry[];
	stats: WorkerStats;
}

import type { HttpStatusCode } from "@trading-model/common/http-status";

export class ApiError extends Error {
	public readonly code = "ApiError" as const;
	constructor(
		public statusCode: HttpStatusCode,
		message: string
	) {
		super(message);
		this.name = "ApiError";
	}
}
