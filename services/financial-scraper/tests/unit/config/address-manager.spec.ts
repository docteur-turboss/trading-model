import { describe, expect, it, jest } from "@jest/globals";

jest.mock("@trading-model/address-manager/create-service-address-manager", () => ({
	createServiceAddressManager: jest.fn(() => ({
		AddressManager: {},
		BOOTSTRAP_ADDRESS_MANAGER: jest.fn(() => ({ stop: jest.fn() })),
		ADDRESS_MANAGER_ROUTES: jest.fn(),
	})),
}));

jest.mock("../../../src/config/env", () => ({
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
