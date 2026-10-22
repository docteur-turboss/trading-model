import type { Job } from "../job.types";

/**
 * Re-queues an orphaned job for another worker.
 *
 * Implemented by ReAllocator from @trading-model/jobs, injected from the
 * composition root so the domain does not depend on the jobs application layer.
 */
export interface ReAllocatorPort {
	reallocate(job: Job): Promise<void>;
}
