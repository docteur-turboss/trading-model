import { describe, expect, it, jest } from "@jest/globals";

import { createServiceRegistry } from "../../src/config/container";

const MOCK_ROUTER = {
	post: jest.fn(),
	get: jest.fn(),
};

jest.mock("express", () => ({
	Router: () => MOCK_ROUTER,
}));

jest.mock("../../src/adapters/inbound/http/register.controller", () => ({
	createRegisterController: jest.fn(),
}));

jest.mock("../../src/adapters/inbound/registration-auth", () => ({
	REGISTRATION_AUTH: "registration-auth-handler",
	REGISTRATION_MTLS_AUTH: "registration-mtls-auth-handler",
}));

jest.mock("../../src/adapters/inbound/registration-ip-allowlist", () => ({
	REGISTRATION_IP_ALLOWLIST: "registration-ip-allowlist-handler",
}));

import { createRegisterController } from "../../src/adapters/inbound/http/register.controller";
import { REGISTRY_ROUTES } from "../../src/adapters/inbound/http/register.routes";

describe("REGISTRY_ROUTES", () => {
	it("should return a router and register all routes", () => {
		const registry = createServiceRegistry();
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
			"registration-ip-allowlist-handler",
			"registration-mtls-auth-handler",
			"registration-auth-handler",
			expect.anything(),
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
