import type {
	IPAddress,
	ISODateTime,
	ModelId,
	Region,
} from "../../domain/primitives";
import { WorkerStatusCode } from "../../domain/primitives";

/**
 * Admin-facing worker status display values (PascalCase strings).
 * Backed by WorkerStatusCode (lowercase) in @trading-model/common/domain/primitives/enums.
 * Use toWorkerStatusCode() to convert AdminWorkerStatus → WorkerStatusCode.
 */
export enum AdminWorkerStatus {
	Online = "Online",
	Draining = "Draining",
	Offline = "Offline",
}

/** Convert AdminWorkerStatus (PascalCase) to WorkerStatusCode (lowercase). */
export function toWorkerStatusCode(
	status: AdminWorkerStatus
): WorkerStatusCode {
	switch (status) {
		case AdminWorkerStatus.Online:
			return WorkerStatusCode.Active;
		case AdminWorkerStatus.Draining:
			return WorkerStatusCode.Draining;
		case AdminWorkerStatus.Offline:
			return WorkerStatusCode.Offline;
		default:
			throw new Error(`Unknown AdminWorkerStatus: ${status satisfies never}`);
	}
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
