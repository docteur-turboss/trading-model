import { describe, expect, it } from "@jest/globals";
import { WorkerStatusCode } from "@trading-model/primitives/primitives";
import type { WorkerRegistration } from "../../src/worker-protocol-types";
import { isWorkerSuitable } from "../../src/worker-protocol-types";

function worker(
	overrides: Partial<WorkerRegistration> = {}
): WorkerRegistration {
	return {
		workerId: "worker-1" as never,
		capabilities: ["training" as never],
		maxConcurrency: 2,
		currentLoad: 0,
		lastHeartbeat: 0 as never,
		status: WorkerStatusCode.Active,
		host: "127.0.0.1" as never,
		port: 8080 as never,
		...overrides,
	};
}

describe("isWorkerSuitable", () => {
	it("should accept an active worker with capacity", () => {
		expect(isWorkerSuitable(worker(), "training" as never)).toBe(true);
	});

	it("should reject inactive workers", () => {
		expect(
			isWorkerSuitable(
				worker({ status: WorkerStatusCode.Draining }),
				"training" as never
			)
		).toBe(false);
	});

	it("should reject workers without the capability", () => {
		expect(
			isWorkerSuitable(
				worker({ capabilities: ["inference" as never] }),
				"training" as never
			)
		).toBe(false);
	});

	it("should reject workers at max concurrency", () => {
		expect(
			isWorkerSuitable(worker({ currentLoad: 2 }), "training" as never)
		).toBe(false);
	});

	it("should reject workers beyond max concurrency", () => {
		expect(
			isWorkerSuitable(worker({ currentLoad: 3 }), "training" as never)
		).toBe(false);
	});
});
