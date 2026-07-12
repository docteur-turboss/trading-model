import type { Job } from "@trading-model/validation/contracts/recovery.types";

export interface IJobQueue {
	enqueue(job: Job): void;
}
