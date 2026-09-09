import { describe, expect, it, jest } from "@jest/globals";

import { ServiceRegistry } from "../../src/domain/service-registry";

const MOCK_ROUTER = {
	post: jest.fn(),
	get: jest.fn(),
};

jest.mock("express", () => ({
	Router: () => MOCK_ROUTER,
}));

jest.mock("../../src/controllers/register.controller", () => ({
	createRegisterController: jest.fn(),
}));

import { createRegisterController } from "../../src/controllers/register.controller";
import { REGISTRY_ROUTES } from "../../src/routes/register.routes";

describe("REGISTRY_ROUTES", () => {
	it("should return a router and register all routes", () => {
		const registry = new ServiceRegistry();
		const mockController = {
			register: "register-handler",
			listServices: "list-services-handler",
			getServiceInstances: "get-service-instances-handler",
			getInstance: "get-instance-handler",
		};
		(createRegisterController as jest.Mock).mockReturnValue(mockController);

		const router = REGISTRY_ROUTES(registry);

		expect(router).toBe(MOCK_ROUTER);
		expect(MOCK_ROUTER.post).toHaveBeenCalledTimes(1);
		expect(MOCK_ROUTER.post).toHaveBeenCalledWith(
			"/register",
			expect.any(Function),
			"register-handler"
		);
		expect(MOCK_ROUTER.get).toHaveBeenCalledTimes(3);
		expect(MOCK_ROUTER.get).toHaveBeenCalledWith(
			"/services",
			"list-services-handler"
		);
		expect(MOCK_ROUTER.get).toHaveBeenCalledWith(
			"/services/:serviceName",
			"get-service-instances-handler"
		);
		expect(MOCK_ROUTER.get).toHaveBeenCalledWith(
			"/services/:serviceName/:instanceId",
			"get-instance-handler"
		);
	});
});
