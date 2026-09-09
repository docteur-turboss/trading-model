import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";

jest.mock("../../../src/infrastructure/config/env", () => ({
	ENV: {
		ACK_TIMEOUT_MS: 30000,
		MAX_QUEUE_DEPTH: 10000,
		MAX_WORKER_LOAD_RATIO: 0.85,
		MAX_RETRIES_PER_JOB: 3,
		ORPHAN_SCAN_INTERVAL_MS: 10000,
		WORKER_HEARTBEAT_TTL_MS: 30000,
	},
}));

import { PositiveInt } from "@trading-model/common/domain/primitives";
import { OrphanDetector } from "@trading-model/common/recovery/orphan-detector";
import { ReAllocator } from "@trading-model/common/recovery/re-allocator";
import type { JobRepository } from "../../../src/persistence/job-repository";
import { InternalQueue } from "../../../src/scheduler/internal-queue";
import type { WorkerRegistry } from "../../../src/worker/worker-registry";
import { createWorkerRegistry } from "../../../src/worker/worker-registry";
import { createJob } from "../../fixtures/job.fixture";

describe("OrphanDetector", () => {
	let registry: WorkerRegistry;
	let reAllocator: ReAllocator;
	let mockRepository: jest.Mocked<JobRepository>;
	let mockQueue: InternalQueue;
	let orphanDetector: OrphanDetector;

	beforeEach(() => {
		jest.useFakeTimers();

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
		registry = createWorkerRegistry(5000);
		reAllocator = new ReAllocator(mockRepository, mockQueue, 30000);
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	describe("start / stop", () => {
		it("should start and stop the detection interval", () => {
			orphanDetector = new OrphanDetector({
				workers: registry,
				repository: mockRepository,
				reAllocator,
				intervalMs: 10000,
			});

			orphanDetector.start();
			expect(jest.getTimerCount()).toBeGreaterThan(0);

			orphanDetector.stop();
			jest.advanceTimersByTime(10000);
			expect(mockRepository.findByWorker).not.toHaveBeenCalled();
		});

		it("should not start multiple intervals", () => {
			orphanDetector = new OrphanDetector({
				workers: registry,
				repository: mockRepository,
				reAllocator,
				intervalMs: 10000,
			});

			orphanDetector.start();
			orphanDetector.start();

			jest.advanceTimersByTime(10000);
			expect(mockRepository.findByWorker).toHaveBeenCalledTimes(0);
		});

		it("should not throw when stopping without having started", () => {
			orphanDetector = new OrphanDetector({
				workers: registry,
				repository: mockRepository,
				reAllocator,
				intervalMs: 10000,
			});

			expect(() => orphanDetector.stop()).not.toThrow();
		});
	});

	describe("detection cycle", () => {
		it("should detect orphaned jobs from stale workers", () => {
			registry.store.register("stale-worker", {
				workerId: "stale-worker" as any,
				host: "10.0.0.1" as any,
				port: 9000 as any,
				capabilities: ["type-a" as any],
				maxConcurrency: PositiveInt.of(5),
				currentLoad: 0,
			});

			jest.advanceTimersByTime(10000);

			mockRepository.findByWorker.mockResolvedValue([
				createJob({ id: "orphan-1" as any }),
			]);

			orphanDetector = new OrphanDetector({
				workers: registry,
				repository: mockRepository,
				reAllocator,
				intervalMs: 5000,
			});
			orphanDetector.start();

			jest.advanceTimersByTime(5000);

			expect(mockRepository.findByWorker).toHaveBeenCalledWith(
				"stale-worker" as any,
				["assigned" as any, "running" as any]
			);
		});

		it("should log error but not crash when detection fails", () => {
			mockRepository.findByWorker.mockRejectedValue(new Error("DB error"));

			registry.store.register("bad-worker", {
				workerId: "bad-worker" as any,
				host: "10.0.0.1" as any,
				port: 9000 as any,
				capabilities: ["type-a" as any],
				maxConcurrency: PositiveInt.of(5),
				currentLoad: 0,
			});

			jest.advanceTimersByTime(10000);

			orphanDetector = new OrphanDetector({
				workers: registry,
				repository: mockRepository,
				reAllocator,
				intervalMs: 5000,
			});
			orphanDetector.start();

			expect(() => {
				jest.advanceTimersByTime(5000);
			}).not.toThrow();
		});

		it("should handle non-Error rejection in detection cycle", () => {
			mockRepository.findByWorker.mockRejectedValue("string error");

			registry.store.register("w1", {
				workerId: "w1" as any,
				host: "10.0.0.1" as any,
				port: 9000 as any,
				capabilities: ["type-a" as any],
				maxConcurrency: PositiveInt.of(5),
				currentLoad: 0,
			});

			jest.advanceTimersByTime(10000);

			orphanDetector = new OrphanDetector({
				workers: registry,
				repository: mockRepository,
				reAllocator,
				intervalMs: 5000,
			});
			orphanDetector.start();

			expect(() => {
				jest.advanceTimersByTime(5000);
			}).not.toThrow();
		});
	});
});
