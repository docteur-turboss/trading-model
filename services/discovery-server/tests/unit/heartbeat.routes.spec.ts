import { describe, expect, it, jest } from "@jest/globals";

import { ServiceRegistry } from "../../src/core/service-registry";

const MOCK_ROUTER = {
	post: jest.fn(),
	get: jest.fn(),
};

jest.mock("express", () => ({
	Router: () => MOCK_ROUTER,
}));

jest.mock("../../src/controllers/heartbeat.controller", () => ({
	createHeartbeatController: jest.fn(),
}));

import { createHeartbeatController } from "../../src/controllers/heartbeat.controller";
import { HEARTBEAT_ROUTES } from "../../src/routes/heartbeat.routes";

describe("HEARTBEAT_ROUTES", () => {
	it("should return a router and register all routes", () => {
		const registry = new ServiceRegistry();
		const mockController = {
			heartbeat: "heartbeat-handler",
			rotateToken: "rotate-token-handler",
		};
		(createHeartbeatController as jest.Mock).mockReturnValue(mockController);

		const router = HEARTBEAT_ROUTES(registry);

		expect(router).toBe(MOCK_ROUTER);
		expect(MOCK_ROUTER.post).toHaveBeenCalledTimes(2);
		expect(MOCK_ROUTER.post).toHaveBeenCalledWith(
			"/heartbeat",
			expect.any(Function),
			"heartbeat-handler"
		);
		expect(MOCK_ROUTER.post).toHaveBeenCalledWith(
			"/token/rotate",
			expect.any(Function),
			"rotate-token-handler"
		);
	});
});
