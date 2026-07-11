import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../../../src/config/env", () => ({
	ENV: {
		ACK_TIMEOUT_MS: 30000,
		MAX_QUEUE_DEPTH: 10000,
		MAX_WORKER_LOAD_RATIO: 0.85,
		MAX_RETRIES_PER_JOB: 3,
		ORPHAN_SCAN_INTERVAL_MS: 10000,
		WORKER_HEARTBEAT_TTL_MS: 30000,
	},
}));

import type { JobRepository } from "../../../src/persistence/job-repository";
import { ReAllocator } from "../../../src/recovery/re-allocator";
import { InternalQueue } from "../../../src/scheduler/internal-queue";
import { createJob } from "../../fixtures/job.fixture";

describe("ReAllocator", () => {
	let reAllocator: ReAllocator;
	let mockRepository: jest.Mocked<JobRepository>;
	let mockQueue: InternalQueue;

	beforeEach(() => {
		mockRepository = {
			insert: jest.fn(),
			findById: jest.fn(),
			updateStatus: jest.fn(),
			incrementRetry: jest.fn(),
			findNonTerminal: jest.fn(),
			findByWorker: jest.fn(),
			findByStatus: jest.fn(),
			ensureIndexes: jest.fn(),
		} as unknown as jest.Mocked<JobRepository>;

		mockQueue = new InternalQueue(30000);
		reAllocator = new ReAllocator(mockRepository, mockQueue, 30000);
	});

	describe("reallocate", () => {
		it("should mark job as failed when maxRetries exceeded", async () => {
			const job = createJob({ retryCount: 3 as any, maxRetries: 3 as any });

			await reAllocator.reallocate(job);

			expect(mockRepository.updateStatus).toHaveBeenCalledWith(
				job.id,
				"failed" as any,
				expect.objectContaining({
					error: expect.stringContaining("max retries"),
				})
			);
		});

		it("should re-enqueue job when retries remain", async () => {
			const job = createJob({
				id: "rejob-1" as any,
				retryCount: 0 as any,
				maxRetries: 3 as any,
			});

			await reAllocator.reallocate(job);

			expect(mockRepository.updateStatus).toHaveBeenCalledWith(
				job.id,
				"queued" as any,
				expect.objectContaining({ ackDeadline: expect.any(Number) })
			);
			expect(mockQueue.depth()).toBe(1);
		});
	});
});
