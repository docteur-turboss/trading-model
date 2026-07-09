import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { JOB_STATUS, Job } from "../../../src/contracts/recovery.types";
import type { JobId, JobType } from "../../../src/domain/primitives";
import type { IJobQueue } from "../../../src/recovery/job-queue.interface";
import type { IJobRepository } from "../../../src/recovery/job-repository.interface";
import { ReAllocator } from "../../../src/recovery/re-allocator";

function createJob(overrides?: Partial<Job>): Job {
	return {
		id: "test-job-1" as unknown as JobId,
		type: "test-type" as unknown as JobType,
		payload: { key: "value" },
		priority: 3,
		status: "assigned" as unknown as JOB_STATUS,
		ackDeadline: 0,
		maxRetries: 3,
		retryCount: 0,
		createdAt: new Date(),
		history: [],
		...overrides,
	};
}

describe("ReAllocator (shared)", () => {
	let reAllocator: ReAllocator;
	let mockRepository: jest.Mocked<IJobRepository>;
	let mockQueue: jest.Mocked<IJobQueue>;

	beforeEach(() => {
		mockRepository = {
			findByWorker: jest.fn(),
			updateStatus: jest.fn(),
		} as unknown as jest.Mocked<IJobRepository>;

		mockQueue = {
			enqueue: jest.fn(),
		} as unknown as jest.Mocked<IJobQueue>;

		reAllocator = new ReAllocator(mockRepository, mockQueue, 30000);
	});

	describe("reallocate", () => {
		it("should mark job as failed when maxRetries exceeded", async () => {
			const job = createJob({ retryCount: 3, maxRetries: 3 });

			await reAllocator.reallocate(job);

			expect(mockRepository.updateStatus).toHaveBeenCalledWith(
				job.id,
				"failed" as unknown as JOB_STATUS,
				expect.objectContaining({
					error: expect.stringContaining("max retries"),
				})
			);
		});

		it("should re-enqueue job when retries remain", async () => {
			const job = createJob({
				id: "rejob-1" as unknown as JobId,
				retryCount: 1,
				maxRetries: 3,
			});

			await reAllocator.reallocate(job);

			expect(mockRepository.updateStatus).toHaveBeenCalledWith(
				job.id,
				"queued" as unknown as JOB_STATUS,
				expect.objectContaining({ ackDeadline: expect.any(Number) })
			);
			expect(mockQueue.enqueue).toHaveBeenCalledWith(
				expect.objectContaining({
					id: "rejob-1",
					status: "queued" as unknown as JOB_STATUS,
					retryCount: 2,
				})
			);
		});

		it("should not enqueue when job is failed", async () => {
			const job = createJob({ retryCount: 5, maxRetries: 3 });

			await reAllocator.reallocate(job);

			expect(mockRepository.updateStatus).toHaveBeenCalledWith(
				job.id,
				"failed" as unknown as JOB_STATUS,
				expect.any(Object)
			);
			expect(mockQueue.enqueue).not.toHaveBeenCalled();
		});

		it("should append re-allocated history entry on re-enqueue", async () => {
			const job = createJob({ retryCount: 0, maxRetries: 3, history: [] });

			await reAllocator.reallocate(job);

			expect(mockQueue.enqueue).toHaveBeenCalledWith(
				expect.objectContaining({
					history: [
						expect.objectContaining({
							fromStatus: "orphaned" as unknown as JOB_STATUS,
							toStatus: "queued" as unknown as JOB_STATUS,
							reason: "re-allocated",
						}),
					],
				})
			);
		});
	});
});
