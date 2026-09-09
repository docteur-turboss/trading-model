import { describe, expect, it } from "@jest/globals";

describe("monitoring index barrel exports", () => {
	it("should export SystemMetrics", () => {
		const { SystemMetrics } = require("../../src/shared/monitoring/index");
		expect(SystemMetrics).toBeDefined();
	});

	it("should export ServiceCallTracker", () => {
		const { ServiceCallTracker } = require("../../src/shared/monitoring/index");
		expect(ServiceCallTracker).toBeDefined();
	});
});
