import { describe, expect, it, jest } from "@jest/globals";

jest.mock(
	"@trading-model/address-manager/application/create-service-address-manager",
	() => ({
		createServiceAddressManager: () => ({
			AddressManager: { start: jest.fn<(...args: any[]) => any>() },
			FIND_A_SERVICE: jest.fn<(...args: any[]) => any>(),
		}),
	})
);

jest.mock("../../src/infrastructure/config/env", () => ({
	ENV: {
		ADDRESS_MANAGER_URL: "https://localhost:8443",
		CACHE_TTL_MS: 84000000,
		SERVICE_PING_TIMEOUT_MS: 84000000,
		TOKEN_REFRESH_INTERVAL_MS: 84000000,
		TTL_REFRESH_INTERVAL_MS: 84000000,
	},
}));

describe("address-manager", () => {
	it("should export AddressManager and FIND_A_SERVICE", () => {
		const mod = jest.requireActual("../../src/config/address-manager") as {
			AddressManager: { start: jest.Mock<(...args: any[]) => any> };
			FIND_A_SERVICE: jest.Mock<(...args: any[]) => any>;
		};
		expect(mod.AddressManager).toBeDefined();
		expect(mod.FIND_A_SERVICE).toBeDefined();
	});
});
