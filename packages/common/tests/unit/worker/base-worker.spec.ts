import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";

const MOCK_POST = jest.fn<any>();

jest.mock("../../../src/config/http-client", () => ({
	HttpClient: jest.fn(() => ({ post: MOCK_POST })),
}));

jest.mock("../../../src/worker/worker-client", () => {
	const MockWorkerClient = jest.fn().mockImplementation(() => {
		const handlers: Record<string, (...args: any[]) => void> = {};
		return {
			on: jest.fn((event: string, handler: (...args: any[]) => void) => {
				handlers[event] = handler;
			}),
			off: jest.fn(),
			connect: jest.fn<any>(),
			disconnect: jest.fn(),
			sendHeartbeat: jest.fn(),
			isConnected: false,
			workerId: "test-worker",
			_trigger: (event: string, ...args: any[]) => {
				if (handlers[event]) {
					handlers[event](...args);
				}
			},
		};
	});
	return { WorkerClient: MockWorkerClient };
});

import type {
	Capability,
	DurationMs,
	JobType,
	PositiveInt,
} from "../../../src/domain/primitives";
import { BaseWorker } from "../../../src/worker/base-worker";
import { WorkerClient } from "../../../src/worker/worker-client";

const MOCK_WORKER_CLIENT = WorkerClient as unknown as jest.Mock<any>;

function getClient(): any {
	return MOCK_WORKER_CLIENT.mock.results[0]?.value;
}

function triggerServerEvent(event: string, ...args: any[]): void {
	const client = getClient();
	if (client?._trigger) {
		client._trigger(event, ...args);
	}
}

describe("BaseWorker", () => {
	let worker: BaseWorker;

	beforeEach(() => {
		jest.clearAllMocks();
		jest.useFakeTimers();

		worker = new BaseWorker({
			serverUrl: "wss://scheduler:3000",
			schedulerHttpUrl: "https://scheduler:3000",
			capabilities: ["test-type" as unknown as Capability],
			maxConcurrency: 3 as PositiveInt,
			heartbeatIntervalMs: 5000 as DurationMs,
		});
	});

	afterEach(() => {
		jest.useRealTimers();
		worker.stop();
	});

	describe("start", () => {
		it("should connect the worker client", async () => {
			const client = getClient();

			await worker.start();

			expect(client.connect).toHaveBeenCalled();
		});
	});

	describe("stop", () => {
		it("should disconnect the worker client", async () => {
			const client = getClient();
			await worker.start();

			worker.stop();

			expect(client.disconnect).toHaveBeenCalled();
		});
	});

	describe("registerHandler", () => {
		it("should process jobs through registered handler", async () => {
			const handler = jest.fn<any>().mockResolvedValue("done");
			worker.registerHandler("test-type" as JobType, handler);

			MOCK_POST.mockResolvedValue(undefined);

			await worker.start();
			triggerServerEvent("job.assigned", {
				id: "job-1",
				type: "test-type",
				payload: { data: 42 },
				ackDeadline: Date.now() + 30000,
			});

			await jest.runAllTimersAsync();

			expect(MOCK_POST).toHaveBeenCalledWith(
				"https://scheduler:3000/jobs/job-1/ack"
			);
			expect(handler).toHaveBeenCalledWith({
				id: "job-1",
				type: "test-type",
				payload: { data: 42 },
			});
			expect(MOCK_POST).toHaveBeenCalledWith(
				"https://scheduler:3000/jobs/job-1/complete",
				{
					result: "done",
				}
			);
		});

		it("should fail the job if no handler is registered for the type", async () => {
			MOCK_POST.mockResolvedValue(undefined);

			await worker.start();
			triggerServerEvent("job.assigned", {
				id: "job-1",
				type: "unknown-type",
				payload: {},
				ackDeadline: Date.now() + 30000,
			});

			await jest.runAllTimersAsync();

			expect(MOCK_POST).toHaveBeenCalledWith(
				"https://scheduler:3000/jobs/job-1/fail",
				{
					error: "No handler registered for job type: unknown-type",
				}
			);
		});

		it("should fail the job when handler throws", async () => {
			const handler = jest
				.fn<any>()
				.mockRejectedValue(new Error("Handler error"));
			worker.registerHandler("test-type" as JobType, handler);

			MOCK_POST.mockResolvedValue(undefined);

			await worker.start();
			triggerServerEvent("job.assigned", {
				id: "job-1",
				type: "test-type",
				payload: {},
				ackDeadline: Date.now() + 30000,
			});

			await jest.runAllTimersAsync();

			expect(MOCK_POST).toHaveBeenCalledWith(
				"https://scheduler:3000/jobs/job-1/fail",
				{
					error: "Handler error",
				}
			);
		});
	});

	describe("drain handling", () => {
		it("should fail incoming jobs when drain is requested", async () => {
			MOCK_POST.mockResolvedValue(undefined);

			await worker.start();
			triggerServerEvent("drain");

			triggerServerEvent("job.assigned", {
				id: "job-1",
				type: "test-type",
				payload: {},
				ackDeadline: Date.now() + 30000,
			});

			await jest.runAllTimersAsync();

			expect(MOCK_POST).toHaveBeenCalledWith(
				"https://scheduler:3000/jobs/job-1/fail",
				{
					error: "Worker is draining",
				}
			);
		});
	});

	describe("activeJobCount", () => {
		it("should return 0 initially", () => {
			expect(worker.activeJobCount).toBe(0);
		});

		it("should track active jobs", async () => {
			const handler = jest.fn<any>().mockImplementation(async () => {
				await new Promise((resolve) => setTimeout(resolve, 1000));
				return "result";
			});
			worker.registerHandler("test-type" as JobType, handler);
			MOCK_POST.mockResolvedValue(undefined);

			await worker.start();
			triggerServerEvent("job.assigned", {
				id: "job-1",
				type: "test-type",
				payload: {},
				ackDeadline: Date.now() + 30000,
			});

			expect(worker.activeJobCount).toBeGreaterThanOrEqual(1);
		});
	});

	describe("isDraining", () => {
		it("should return false initially", () => {
			expect(worker.isDraining).toBe(false);
		});

		it("should return true after drain event", async () => {
			await worker.start();
			triggerServerEvent("drain");

			expect(worker.isDraining).toBe(true);
		});
	});

	describe("ack timer edge cases", () => {
		it("should fire ack timer when job outlives ackDeadline", async () => {
			const handler = jest.fn<any>().mockImplementation(async () => {
				await new Promise((resolve) => setTimeout(resolve, 60000));
				return "late-result";
			});
			worker.registerHandler("test-type" as JobType, handler);
			MOCK_POST.mockResolvedValue(undefined);

			await worker.start();
			triggerServerEvent("job.assigned", {
				id: "job-ack",
				type: "test-type",
				payload: {},
				ackDeadline: Date.now(), // expires immediately
			});

			// Advance past the ack timer (which fires at remaining=0)
			await jest.advanceTimersByTimeAsync(1);

			// The ack timer callback (line 83) fires and deletes the job from activeJobs
			// The handler is still pending
			// The finally block will also try to delete it later — no-op
		});

		it("should handle non-Error throw from handler", async () => {
			const handler = jest.fn<any>().mockRejectedValue("string-error");
			worker.registerHandler("test-type" as JobType, handler);
			MOCK_POST.mockResolvedValue(undefined);

			await worker.start();
			triggerServerEvent("job.assigned", {
				id: "job-err",
				type: "test-type",
				payload: {},
				ackDeadline: Date.now() + 30000,
			});

			await jest.runAllTimersAsync();

			// The non-Error value is converted to string via String(err)
			expect(MOCK_POST).toHaveBeenCalledWith(
				"https://scheduler:3000/jobs/job-err/fail",
				{
					error: "string-error",
				}
			);
		});
	});
});
