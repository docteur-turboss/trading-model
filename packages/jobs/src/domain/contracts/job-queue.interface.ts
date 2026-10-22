import type { Job } from "@trading-model/contracts/recovery-types";

export interface IJobQueue {
	enqueue(job: Job): void;
}
