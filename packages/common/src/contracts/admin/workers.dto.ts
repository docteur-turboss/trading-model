import type {
	IPAddress,
	ISODateTime,
	ModelId,
	Region,
	WorkerStatusCode,
} from "../../domain/primitives";

export interface WorkerEntry {
	id: ModelId;
	ip: IPAddress;
	region: Region;
	cpu: number;
	ram: number;
	status: WorkerStatusCode;
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
