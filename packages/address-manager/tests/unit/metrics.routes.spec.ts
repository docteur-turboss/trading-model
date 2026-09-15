import { describe, expect, it } from "@jest/globals";
import { STATUS_ROUTES } from "../../src/adapters/inbound/routes/metrics.routes";

describe("STATUS_ROUTES", () => {
	it("should be a router with /status route", () => {
		expect(STATUS_ROUTES).toBeDefined();
		const stack = (STATUS_ROUTES as any).stack;
		expect(stack).toHaveLength(1);
		expect(stack[0].route.path).toBe("/status");
		expect(stack[0].route.methods).toEqual({ get: true });
	});
});
