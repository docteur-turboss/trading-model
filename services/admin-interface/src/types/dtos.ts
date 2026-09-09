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
} from "@trading-model/validation/adapters/inbound/admin";

export type {
	AdminServiceInstance,
	AuditEvent,
	AuditFilter,
	CacheEntry,
	CacheStats,
	Candle,
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
} from "@trading-model/validation/adapters/inbound/admin";

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
	import("@trading-model/validation/shared/contracts/market-data.types").OrderBookLevel;

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
