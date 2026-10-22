/** Tuning values of the job scheduler, resolved from the environment by the composition root. */
export interface SchedulerConfig {
	ackTimeoutMs: number;
	maxQueueDepth: number;
	maxWorkerLoadRatio: number;
	maxRetriesPerJob: number;
	orphanScanIntervalMs: number;
	workerHeartbeatTtlMs: number;
}

export interface SchedulerMetrics {
	incOrphanJobs(): void;
}
