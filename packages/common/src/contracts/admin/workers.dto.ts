import type {
	IPAddress,
	ISODateTime,
	ModelId,
	Region,
} from "../../domain/primitives";

/**
 * Admin-facing worker status display values.
 * Backed by WorkerStatusCode in @trading-model/common/domain/primitives/enums.
 * Keep in sync when adding new worker statuses.
 */
export enum AdminWorkerStatus {
	Online = "Online",
	Draining = "Draining",
	Offline = "Offline",
}

export interface WorkerEntry {
	id: ModelId;
	ip: IPAddress;
	region: Region;
	cpu: number;
	ram: number;
	status: AdminWorkerStatus;
	heartbeat: ISODateTime;
	activeJobs: number;
}

export interface WorkerStats {
	activeWorkers: number;
	totalWorkers: number;
	avgCpu: number;
	totalJobsPerMin: number;
	clusterMemory: number;
}
