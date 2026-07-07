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
	Percentage,
	TradingSymbol,
} from "@trading-model/common/domain/primitives";
import { AppError } from "@trading-model/common/utils/errors";

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
	activeServices: number;
	totalServices: number;
	totalInstances: number;
	errorsRate: number;
	avgLatency: number;
}

export type OrderBookLevel = import("@trading-model/common/contracts/market-data.types").OrderBookLevel;

export interface OrderBook {
	bids: OrderBookLevel[];
	asks: OrderBookLevel[];
}

export interface AdminAuditFilter extends PaginationQuery, AuditFilter {
	search?: string;
}

export interface PaginatedEvents extends PaginationResult<AuditEvent> {
	volumeByTopic: { topic: string; count: number }[];
}

export interface JobList {
	jobs: JobEntry[];
	stats: { pending: number; inProgress: number; failed: number };
}

export interface DlqMessageList {
	messages: DlqMessage[];
	stats: {
		pending: number;
		retryRate: Percentage;
		totalSize: number;
		lastIncident: string;
	};
}

export interface PaginatedResults {
	results: TrainingResult[];
	total: number;
}

export interface TrainingFilter {
	symbol?: TradingSymbol;
	generation?: number;
}

export interface CacheEntryList {
	entries: CacheEntry[];
	stats: { hitRate: Percentage; activeEntries: number };
}

export interface WorkerList {
	workers: WorkerEntry[];
	stats: WorkerStats;
}

export class ApiError extends AppError {
	constructor(
		public statusCode: number,
		message: string
	) {
		super(message, { code: "ApiError" });
		this.name = "ApiError";
	}
}
