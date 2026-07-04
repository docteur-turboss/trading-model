import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const MOCK_ROUTER = {
	get: jest.fn(),
};
const MOCK_CONTROLLER = { ping: jest.fn(), health: jest.fn() };

jest.mock("express", () => ({
	Router: jest.fn(() => MOCK_ROUTER),
}));

jest.mock("../../../src/controllers/health.controller", () => ({
	createHealthController: jest.fn(() => MOCK_CONTROLLER),
}));

import { healthRoutes } from "../../../src/routes/health.routes";

describe("healthRoutes", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("should register GET /ping and GET /health", () => {
		const queue = {} as any;
		const backPressure = {} as any;
		const workers = {} as any;

		const router = healthRoutes(queue, backPressure, workers);

		expect(router).toBe(MOCK_ROUTER);
		expect(MOCK_ROUTER.get).toHaveBeenCalledWith("/ping", MOCK_CONTROLLER.ping);
		expect(MOCK_ROUTER.get).toHaveBeenCalledWith(
			"/health",
			MOCK_CONTROLLER.health
		);
	});
});
