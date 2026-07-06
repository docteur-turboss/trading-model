import type {
	AuditEvent,
	CacheEntry,
	DlqMessage,
	JobEntry,
	ServiceRegistryEntry,
	TopologyLink,
	TrainingResult,
	WorkerEntry,
	WorkerStats,
} from "@trading-model/common/contracts/admin";

export type {
	AuditEvent,
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
	AdminServiceInstance,
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

export interface AuditFilter {
	topic?: string;
	publisher?: string;
	correlationId?: string;
	search?: string;
	page?: number;
	limit?: number;
}

export interface PaginatedEvents {
	events: AuditEvent[];
	total: number;
	page: number;
	limit: number;
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
		retryRate: number;
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
	stats: { hitRate: number; activeEntries: number };
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
