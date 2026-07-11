import type {
	IPAddress,
	ISODateTime,
	MemoryAmount,
	ModelId,
	Percentage,
	PositiveInt,
	Region,
	WorkerStatusCode,
} from "../../domain/primitives";

export interface WorkerEntry {
	id: ModelId;
	ip: IPAddress;
	region: Region;
	cpu: Percentage;
	ram: MemoryAmount;
	status: WorkerStatusCode;
	heartbeat: ISODateTime;
	activeJobs: PositiveInt;
}

export interface WorkerStats {
	activeWorkers: PositiveInt;
	totalWorkers: PositiveInt;
	avgCpu: Percentage;
	totalJobsPerMin: PositiveInt;
	clusterMemory: MemoryAmount;
}
