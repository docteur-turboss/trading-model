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
import type { Percentage } from "@trading-model/common/domain/primitives";

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

export interface OrderBookLevel {
	price: string;
	quantity: string;
}

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
	symbol?: string;
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

export class ApiError extends Error {
	constructor(
		public statusCode: number,
		message: string
	) {
		super(message);
		this.name = "ApiError";
	}
}
