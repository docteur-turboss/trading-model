import { describe, expect, it, jest } from "@jest/globals";

import { createServiceRegistry } from "../../src/config/container";

const MOCK_ROUTER = {
	post: jest.fn(),
	get: jest.fn(),
};

jest.mock("express", () => ({
	Router: () => MOCK_ROUTER,
}));

jest.mock("../../src/adapters/inbound/http/heartbeat.controller", () => ({
	createHeartbeatController: jest.fn(),
}));

import { createHeartbeatController } from "../../src/adapters/inbound/http/heartbeat.controller";
import { HEARTBEAT_ROUTES } from "../../src/adapters/inbound/http/heartbeat.routes";

describe("HEARTBEAT_ROUTES", () => {
	it("should return a router and register all routes", () => {
		const registry = createServiceRegistry();
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
