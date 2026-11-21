import { describe, expect, it, jest } from "@jest/globals";

const mockListenExpress = jest.fn<(...args: any[]) => any>();
const mockFindService = jest.fn<(...args: any[]) => any>();

jest.mock(
	"@trading-model/address-manager/create-service-address-manager",
	() => ({
		createServiceAddressManager: jest.fn((..._args: any[]) => ({
			AddressManager: {},
			ADDRESS_MANAGER_ROUTES: mockListenExpress,
			FIND_A_SERVICE: mockFindService,
		})),
	})
);

jest.mock("../../../src/infrastructure/config/env", () => ({
	env: {},
}));

import {
	ADDRESS_MANAGER_ROUTES,
	FIND_A_SERVICE,
} from "../../../src/config/address-manager";

describe("address-manager", () => {
	it("should export listenExpress from address manager", () => {
		expect(ADDRESS_MANAGER_ROUTES).toBe(mockListenExpress);
	});

	it("should export findService from address manager", () => {
		expect(FIND_A_SERVICE).toBe(mockFindService);
	});
});
