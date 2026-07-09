import { describe, expect, it, jest } from "@jest/globals";

const mockListenExpress = jest.fn();
const mockFindService = jest.fn();
const mockStart = jest.fn();

jest.mock(
	"@trading-model/address-manager/create-service-address-manager",
	() => ({
		createServiceAddressManager: jest.fn(() => ({
			AddressManager: {},
			ADDRESS_MANAGER_ROUTES: mockListenExpress,
			FIND_A_SERVICE: mockFindService,
			BOOTSTRAP_ADDRESS_MANAGER: mockStart,
		})),
	})
);

jest.mock("../../../src/config/env", () => ({
	env: {},
}));

import {
	ADDRESS_MANAGER_ROUTES,
	BOOTSTRAP_ADDRESS_MANAGER,
	FIND_A_SERVICE,
} from "../../../src/config/address-manager";

describe("address-manager", () => {
	it("should export listenExpress from address manager", () => {
		expect(ADDRESS_MANAGER_ROUTES).toBe(mockListenExpress);
	});

	it("should export findService from address manager", () => {
		expect(FIND_A_SERVICE).toBe(mockFindService);
	});

	it("should export start from address manager", () => {
		expect(BOOTSTRAP_ADDRESS_MANAGER).toBe(mockStart);
	});
});
