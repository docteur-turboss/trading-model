import { describe, expect, it, jest } from "@jest/globals";

jest.mock(
	"@trading-model/address-manager/create-service-address-manager",
	() => ({
		createServiceAddressManager: () => ({
			AddressManager: { start: jest.fn() },
			FIND_A_SERVICE: jest.fn(),
		}),
	})
);

jest.mock("../../src/config/env", () => ({
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
			AddressManager: { start: jest.Mock };
			FIND_A_SERVICE: jest.Mock;
		};
		expect(mod.AddressManager).toBeDefined();
		expect(mod.FIND_A_SERVICE).toBeDefined();
	});
});
