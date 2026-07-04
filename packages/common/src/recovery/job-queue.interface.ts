import type { Job } from "../contracts/recovery.types";

export interface IJobQueue {
	enqueue(job: Job): void;
}
