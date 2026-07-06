import type { IPAddress, Port } from "../../domain/primitives";

export interface WorkerEntry {
	id: string;
	ip: IPAddress;
	region: string;
	cpu: number;
	ram: number;
	status: "Online" | "Draining" | "Offline";
	heartbeat: string;
	activeJobs: number;
}

export interface WorkerStats {
	activeWorkers: number;
	totalWorkers: number;
	avgCpu: number;
	totalJobsPerMin: number;
	clusterMemory: number;
}
