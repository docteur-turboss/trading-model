import { describe, expect, it, jest } from "@jest/globals";
import { TokenManager } from "../../src/application/client/token-manager";
import { HeartbeatManager } from "../../src/application/heartbeat-manager";
import { RegistrationAttemptHandler } from "../../src/application/registration-attempt-handler";

const mockTokenManager = new TokenManager({} as never, {} as never);

jest.mock("../../src/application/create-address-manager", () => ({
	createAddressManager: () => ({ tokenManager: mockTokenManager }),
}));

import { createServiceAddressManager } from "../../src/application/create-service-address-manager";

describe("createServiceAddressManager REGISTRATION_READINESS", () => {
	it("is false until the first registration succeeds, then stays true when discovery fails", async () => {
		const { REGISTRATION_READINESS } = createServiceAddressManager({} as never);
		const registerService = jest.fn<() => Promise<{ token: string }>>();
		const addressManagerClient = {
			registerService,
			refreshTTL: jest
				.fn<() => Promise<void>>()
				.mockRejectedValue(
					Object.assign(new Error("Instance not found"), { statusCode: 404 })
				),
			hasIpChanged: () => false,
		} as never;

		expect(REGISTRATION_READINESS.check()).toBe(false);

		registerService.mockResolvedValueOnce({ token: "t1" });
		await new RegistrationAttemptHandler({
			addressManagerClient,
			tokenManager: mockTokenManager,
		}).tryStickyRegistration();
		expect(REGISTRATION_READINESS.check()).toBe(true);

		// Discovery lost the lease (Redis restarted empty) and re-registration fails too.
		registerService.mockRejectedValue(new Error("getaddrinfo ENOTFOUND"));
		await new HeartbeatManager({
			addressManagerClient,
			tokenManager: mockTokenManager,
		}).sendHeartbeat({} as never);
		expect(registerService).toHaveBeenCalledTimes(2);
		expect(REGISTRATION_READINESS.check()).toBe(true);
	});
});
