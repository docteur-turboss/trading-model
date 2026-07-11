import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";

import { InternalQueue } from "../../../src/scheduler/internal-queue";
import { createJob } from "../../fixtures/job.fixture";

describe("InternalQueue", () => {
	let queue: InternalQueue;

	beforeEach(() => {
		jest.useFakeTimers();
		queue = new InternalQueue(30000);
	});

	afterEach(() => {
		queue.stop();
		jest.useRealTimers();
	});

	describe("enqueue", () => {
		it("should add a job to the correct priority queue", () => {
			const job = createJob({ priority: 1 as any });
			queue.enqueue(job);

			expect(queue.depth()).toBe(1);
		});

		it("should enqueue jobs at different priorities", () => {
			queue.enqueue(createJob({ priority: 1 as any }));
			queue.enqueue(createJob({ priority: 5 as any }));

			expect(queue.depth()).toBe(2);
		});
	});

	describe("dequeue", () => {
		it("should return null when queue is empty", () => {
			expect(queue.dequeue()).toBeNull();
		});

		it("should return the highest priority job first", () => {
			queue.enqueue(createJob({ id: "low" as any, priority: 5 as any }));
			queue.enqueue(createJob({ id: "high" as any, priority: 1 as any }));

			const result = queue.dequeue();
			expect(result).not.toBeNull();
			expect(result!.job.id).toBe("high");
		});

		it("should return jobs in FIFO order within the same priority", () => {
			queue.enqueue(createJob({ id: "first" as any, priority: 3 as any }));
			queue.enqueue(createJob({ id: "second" as any, priority: 3 as any }));

			expect(queue.dequeue()!.job.id).toBe("first");
			expect(queue.dequeue()!.job.id).toBe("second");
		});

		it("should remove the job from the queue", () => {
			queue.enqueue(createJob({ priority: 3 as any }));
			queue.dequeue();

			expect(queue.depth()).toBe(0);
		});
	});

	describe("markDelivered / ack", () => {
		it("should call onAckTimeout when ack is not called within timeout", () => {
			const onTimeout = jest.fn();

			queue.enqueue(createJob({ id: "job-1" as any }));
			queue.markDelivered("job-1" as any, onTimeout);

			jest.advanceTimersByTime(30000);

			expect(onTimeout).toHaveBeenCalledWith("job-1" as any);
		});

		it("should not call onAckTimeout when ack is called in time", () => {
			const onTimeout = jest.fn();

			queue.markDelivered("job-1" as any, onTimeout);
			queue.ack("job-1" as any);

			jest.advanceTimersByTime(30000);

			expect(onTimeout).not.toHaveBeenCalled();
		});

		it("should not fail when ack is called for unknown jobId", () => {
			expect(() => queue.ack("unknown" as any)).not.toThrow();
		});
	});

	describe("depth", () => {
		it("should return 0 for empty queue", () => {
			expect(queue.depth()).toBe(0);
		});

		it("should return total count across all priorities", () => {
			queue.enqueue(createJob({ priority: 1 as any }));
			queue.enqueue(createJob({ priority: 2 as any }));
			queue.enqueue(createJob({ priority: 5 as any }));

			expect(queue.depth()).toBe(3);
		});
	});

	describe("markDelivered without callback", () => {
		it("should not throw when ack timeout fires without callback set", () => {
			queue.markDelivered("job-1" as any);
			expect(() => {
				jest.advanceTimersByTime(30000);
			}).not.toThrow();
		});
	});

	describe("stop", () => {
		it("should clear all pending ack timers", () => {
			const onTimeout = jest.fn();

			queue.markDelivered("job-1" as any, onTimeout);
			queue.markDelivered("job-2" as any, onTimeout);
			queue.stop();

			jest.advanceTimersByTime(30000);

			expect(onTimeout).not.toHaveBeenCalled();
		});
	});
});
