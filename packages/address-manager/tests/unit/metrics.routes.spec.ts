import { describe, expect, it } from "@jest/globals";
import { METRICS_ROUTES } from "../../src/adapters/inbound/routes/metrics.routes";

describe("METRICS_ROUTES", () => {
	it("should be a router with /metrics route", () => {
		expect(METRICS_ROUTES).toBeDefined();
		const stack = (METRICS_ROUTES as any).stack;
		expect(stack).toHaveLength(1);
		expect(stack[0].route.path).toBe("/metrics");
		expect(stack[0].route.methods).toEqual({ get: true });
	});
});
