import type {
	IPAddress,
	ISODateTime,
	ModelId,
	Region,
} from "../../domain/primitives";
import {
	WorkerStatusCode,
	formatWorkerDisplayName,
	parseWorkerDisplayName,
} from "../../domain/primitives";

export enum AdminWorkerStatus {
	Online = "Online",
	Draining = "Draining",
	Offline = "Offline",
}

/** Convert AdminWorkerStatus (PascalCase) to WorkerStatusCode (lowercase). */
export function toWorkerStatusCode(
	status: AdminWorkerStatus
): WorkerStatusCode {
	const parsed = parseWorkerDisplayName(status);
	if (!parsed) {
		throw new Error(`Unknown AdminWorkerStatus: ${status}`);
	}
	return parsed;
}

/** Convert WorkerStatusCode (lowercase) to AdminWorkerStatus (PascalCase). */
export function fromWorkerStatusCode(
	status: WorkerStatusCode
): AdminWorkerStatus {
	return formatWorkerDisplayName(status) as AdminWorkerStatus;
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
