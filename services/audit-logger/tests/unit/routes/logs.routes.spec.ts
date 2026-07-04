import { describe, expect, it, jest } from "@jest/globals";

jest.mock("../../../src/controllers/logs.controller", () => ({
	getLogsController: jest.fn(() => ({
		listLogs: jest.fn(),
		getLogStats: jest.fn(),
		getLogById: jest.fn(),
	})),
}));

import { logsRoutes } from "../../../src/routes/logs.routes";

describe("logs.routes", () => {
	it("should create a router with 3 routes", () => {
		const router = logsRoutes({} as any);
		expect(router).toBeDefined();
		expect(router.stack.length).toBe(3);
	});

	it("should have GET /logs route", () => {
		const router = logsRoutes({} as any);
		const route = router.stack.find(
			(l: any) => l.route && l.route.path === "/logs"
		);
		expect(route).toBeDefined();
	});

	it("should have GET /logs/stats route", () => {
		const router = logsRoutes({} as any);
		const route = router.stack.find(
			(l: any) => l.route && l.route.path === "/logs/stats"
		);
		expect(route).toBeDefined();
	});

	it("should have GET /logs/:id route", () => {
		const router = logsRoutes({} as any);
		const route = router.stack.find(
			(l: any) => l.route && l.route.path === "/logs/:id"
		);
		expect(route).toBeDefined();
	});
});
