import type { Job } from "@trading-model/common/contracts/recovery-types";

export interface IJobQueue {
	enqueue(job: Job): void;
}
