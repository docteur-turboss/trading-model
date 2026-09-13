import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";
import type {
	Capability,
	InstanceId,
	IPAddress,
	JobId,
	JobType,
	Port,
} from "@trading-model/common/domain/primitives";
import {
	PositiveInt,
	UnixTimestamp,
} from "@trading-model/common/domain/primitives";
import { OrphanDetector } from "@trading-model/jobs/application/services/orphan-detector";
import { ReAllocator } from "@trading-model/jobs/application/services/re-allocator";
import type { WorkerRegistry } from "@trading-model/jobs/application/services/worker-registry";
import { createWorkerRegistry } from "@trading-model/jobs/application/services/worker-registry";
import type { IJobQueue } from "@trading-model/jobs/domain/contracts/job-queue.interface";
import type { IJobRepository } from "@trading-model/jobs/domain/contracts/job-repository.interface";
import type {
	JOB_STATUS,
	Job,
} from "@trading-model/validation/domain/contracts/recovery.types";
import { JobPriority } from "@trading-model/validation/domain/contracts/recovery.types";

function createJob(overrides?: Partial<Job>): Job {
	return {
		id: "test-job-1" as unknown as JobId,
		type: "test-type" as unknown as JobType,
		payload: { key: "value" },
		priority: JobPriority.MEDIUM,
		status: "assigned" as unknown as JOB_STATUS,
		ackDeadline: 0 as PositiveInt,
		maxRetries: 3 as PositiveInt,
		retryCount: 0 as PositiveInt,
		createdAt: UnixTimestamp.now(),
		history: [],
		...overrides,
	};
}

describe("OrphanDetector (shared)", () => {
	let registry: WorkerRegistry;
	let reAllocator: ReAllocator;
	let mockRepository: jest.Mocked<IJobRepository>;
	let mockQueue: jest.Mocked<IJobQueue>;
	let orphanDetector: OrphanDetector;

	beforeEach(() => {
		jest.useFakeTimers();

		mockRepository = {
			findByWorker: jest.fn(),
			updateStatus: jest.fn(),
		} as unknown as jest.Mocked<IJobRepository>;

		mockQueue = {
			enqueue: jest.fn(),
		} as unknown as jest.Mocked<IJobQueue>;

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
				workerId: "stale-worker" as unknown as InstanceId,
				host: "10.0.0.1" as IPAddress,
				port: 9000 as Port,
				capabilities: ["type-a" as unknown as Capability],
				maxConcurrency: PositiveInt.of(5),
				currentLoad: 0,
			});

			jest.advanceTimersByTime(10000);

			mockRepository.findByWorker.mockResolvedValue([
				createJob({ id: "orphan-1" as unknown as JobId }),
			]);

			orphanDetector = new OrphanDetector({
				workers: registry,
				repository: mockRepository,
				reAllocator,
				intervalMs: 5000,
			});
			orphanDetector.start();

			jest.advanceTimersByTime(5000);

			expect(mockRepository.findByWorker).toHaveBeenCalledWith("stale-worker", [
				"assigned" as unknown as JOB_STATUS,
				"running" as unknown as JOB_STATUS,
			]);
		});

		it("should update status to orphaned and reallocate stale jobs", async () => {
			registry.store.register("stale-w", {
				workerId: "stale-w" as unknown as InstanceId,
				host: "10.0.0.2" as IPAddress,
				port: 9001 as Port,
				capabilities: ["type-a" as unknown as Capability],
				maxConcurrency: PositiveInt.of(5),
				currentLoad: 0,
			});

			jest.advanceTimersByTime(10000);

			mockRepository.findByWorker.mockResolvedValue([
				createJob({ id: "orphan-1" as unknown as JobId }),
			]);

			orphanDetector = new OrphanDetector({
				workers: registry,
				repository: mockRepository,
				reAllocator,
				intervalMs: 5000,
			});
			orphanDetector.start();

			jest.advanceTimersByTime(5000);

			await Promise.resolve();

			expect(mockRepository.updateStatus).toHaveBeenCalledWith(
				"orphan-1",
				"orphaned" as unknown as JOB_STATUS
			);
		});

		it("should log error but not crash when detection fails", () => {
			mockRepository.findByWorker.mockRejectedValue(new Error("DB error"));

			registry.store.register("bad-worker", {
				workerId: "bad-worker" as unknown as InstanceId,
				host: "10.0.0.1" as IPAddress,
				port: 9000 as Port,
				capabilities: ["type-a" as unknown as Capability],
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

		it("should return early when no stale workers exist", async () => {
			orphanDetector = new OrphanDetector({
				workers: registry,
				repository: mockRepository,
				reAllocator,
				intervalMs: 5000,
			});
			orphanDetector.start();

			jest.advanceTimersByTime(5000);
			await Promise.resolve();

			expect(mockRepository.findByWorker).not.toHaveBeenCalled();
			expect(mockRepository.updateStatus).not.toHaveBeenCalled();
		});

		it("should handle non-Error rejection in detection cycle", () => {
			mockRepository.findByWorker.mockRejectedValue("string error");

			registry.store.register("w1", {
				workerId: "w1" as unknown as InstanceId,
				host: "10.0.0.1" as IPAddress,
				port: 9000 as Port,
				capabilities: ["type-a" as unknown as Capability],
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
