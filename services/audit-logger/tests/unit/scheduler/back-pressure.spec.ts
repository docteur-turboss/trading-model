import { beforeEach, describe, expect, it } from "@jest/globals";

import { BackPressure } from "../../../src/scheduler/back-pressure";

describe("BackPressure", () => {
	let backPressure: BackPressure;

	beforeEach(() => {
		backPressure = new BackPressure(100, 0.85);
	});

	describe("canAccept", () => {
		it("should return true when queue is empty and no workers", () => {
			expect(backPressure.canAccept()).toBe(true);
		});

		it("should return true when queue depth is below threshold", () => {
			backPressure.updateQueueDepth(50);
			expect(backPressure.canAccept()).toBe(true);
		});

		it("should return false when queue depth exceeds max", () => {
			backPressure.updateQueueDepth(100);
			expect(backPressure.canAccept()).toBe(false);
		});

		it("should return true when all workers are below load ratio", () => {
			backPressure.updateWorkerLoad("worker-1", 0.5);
			backPressure.updateWorkerLoad("worker-2", 0.6);
			expect(backPressure.canAccept()).toBe(true);
		});

		it("should return false when all workers are above load ratio", () => {
			backPressure.updateWorkerLoad("worker-1", 0.9);
			backPressure.updateWorkerLoad("worker-2", 0.95);
			expect(backPressure.canAccept()).toBe(false);
		});

		it("should return true when some workers are below load ratio", () => {
			backPressure.updateWorkerLoad("worker-1", 0.9);
			backPressure.updateWorkerLoad("worker-2", 0.5);
			expect(backPressure.canAccept()).toBe(true);
		});
	});

	describe("retryAfterSeconds", () => {
		it("should return 5s for queue depth under 100", () => {
			backPressure.updateQueueDepth(50);
			expect(backPressure.retryAfterSeconds()).toBe(5);
		});

		it("should return 15s for queue depth around 210", () => {
			backPressure.updateQueueDepth(210);
			expect(backPressure.retryAfterSeconds()).toBe(15);
		});
	});

	describe("updateQueueDepth", () => {
		it("should update the internal queue depth", () => {
			backPressure.updateQueueDepth(50);
			expect(backPressure.canAccept()).toBe(true);

			backPressure.updateQueueDepth(150);
			expect(backPressure.canAccept()).toBe(false);
		});
	});

	describe("updateWorkerLoad / removeWorker", () => {
		it("should update individual worker loads", () => {
			backPressure.updateWorkerLoad("worker-1", 0.9);
			backPressure.updateWorkerLoad("worker-2", 0.5);

			expect(backPressure.canAccept()).toBe(true);
		});

		it("should allow acceptance when a removed worker was the bottleneck", () => {
			backPressure.updateWorkerLoad("worker-1", 0.9);
			expect(backPressure.canAccept()).toBe(false);

			backPressure.removeWorker("worker-1");
			expect(backPressure.canAccept()).toBe(true);
		});
	});
});
