import { describe, expect, it, jest } from "@jest/globals";

const MOCK_ROUTER = {
	get: jest.fn<(...args: any[]) => any>(),
};
const MOCK_CONTROLLER = { health: jest.fn<(...args: any[]) => any>() };

jest.mock("express", () => ({
	Router: jest.fn((..._args: any[]) => MOCK_ROUTER),
}));

jest.mock("../../../src/adapters/inbound/http/health.controller", () => ({
	createHealthController: jest.fn((..._args: any[]) => MOCK_CONTROLLER),
}));

import { healthRoutes } from "../../../src/adapters/inbound/http/health.routes";

describe("healthRoutes", () => {
	it("should register GET /health on the controller", () => {
		const router = healthRoutes();

		expect(router).toBe(MOCK_ROUTER);
		expect(MOCK_ROUTER.get).toHaveBeenCalledTimes(1);
		expect(MOCK_ROUTER.get).toHaveBeenCalledWith(
			"/health",
			MOCK_CONTROLLER.health
		);
	});
});
