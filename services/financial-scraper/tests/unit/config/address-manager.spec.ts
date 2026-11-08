import { describe, expect, it, jest } from "@jest/globals";

jest.mock(
	"@trading-model/address-manager/application/create-service-address-manager",
	() => ({
		createServiceAddressManager: jest.fn((..._args: any[]) => ({
			AddressManager: {},
			BOOTSTRAP_ADDRESS_MANAGER: jest.fn((..._args: any[]) => ({
				stop: jest.fn<(...args: any[]) => any>(),
			})),
			ADDRESS_MANAGER_ROUTES: jest.fn<(...args: any[]) => any>(),
		})),
	})
);

jest.mock("../../../src/infrastructure/config/env", () => ({
	ENV: {},
}));

import {
	ADDRESS_MANAGER_ROUTES,
	AddressManager,
	BOOTSTRAP_ADDRESS_MANAGER,
} from "../../../src/config/address-manager";

describe("config/address-manager", () => {
	it("should export BOOTSTRAP_ADDRESS_MANAGER", () => {
		expect(BOOTSTRAP_ADDRESS_MANAGER).toBeDefined();
	});

	it("should export ADDRESS_MANAGER_ROUTES", () => {
		expect(ADDRESS_MANAGER_ROUTES).toBeDefined();
	});

	it("should export AddressManager", () => {
		expect(AddressManager).toBeDefined();
	});
});
