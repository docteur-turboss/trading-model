import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";
import type { Job } from "../../../src/contracts/recovery.types";
import type { IJobQueue } from "../../../src/recovery/job-queue.interface";
import type { IJobRepository } from "../../../src/recovery/job-repository.interface";
import type { IPAddress, Port } from "../../../src/domain/primitives";
import { OrphanDetector } from "../../../src/recovery/orphan-detector";
import { ReAllocator } from "../../../src/recovery/re-allocator";
import { WorkerRegistry } from "../../../src/worker/worker-registry";

function createJob(overrides?: Partial<Job>): Job {
	return {
		id: "test-job-1",
		type: "test-type",
		payload: { key: "value" },
		priority: 3,
		status: "assigned",
		ackDeadline: 0,
		maxRetries: 3,
		retryCount: 0,
		createdAt: new Date(),
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

		registry = new WorkerRegistry(5000);
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
			registry.register("stale-worker", {
				workerId: "stale-worker",
				address: "10.0.0.1" as IPAddress,
				port: 9000 as Port,
				capabilities: ["type-a"],
				maxConcurrency: 5,
				currentLoad: 0,
			});

			jest.advanceTimersByTime(10000);

			mockRepository.findByWorker.mockResolvedValue([
				createJob({ id: "orphan-1" }),
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
				"assigned",
				"running",
			]);
		});

		it("should update status to orphaned and reallocate stale jobs", async () => {
			registry.register("stale-w", {
				workerId: "stale-w",
				address: "10.0.0.2" as IPAddress,
				port: 9001 as Port,
				capabilities: ["type-a"],
				maxConcurrency: 5,
				currentLoad: 0,
			});

			jest.advanceTimersByTime(10000);

			mockRepository.findByWorker.mockResolvedValue([
				createJob({ id: "orphan-1" }),
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
				"orphaned"
			);
		});

		it("should log error but not crash when detection fails", () => {
			mockRepository.findByWorker.mockRejectedValue(new Error("DB error"));

			registry.register("bad-worker", {
				workerId: "bad-worker",
				address: "10.0.0.1" as IPAddress,
				port: 9000 as Port,
				capabilities: ["type-a"],
				maxConcurrency: 5,
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

			registry.register("w1", {
				workerId: "w1",
				address: "10.0.0.1" as IPAddress,
				port: 9000 as Port,
				capabilities: ["type-a"],
				maxConcurrency: 5,
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
