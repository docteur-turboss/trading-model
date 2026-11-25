import { describe, expect, it, jest } from "@jest/globals";

const MOCK_ADDRESS_MANAGER_INSTANCE = {
	getToken: jest.fn<(...args: any[]) => any>(),
	start: jest.fn((..._args: any[]) => ({
		stop: jest.fn<(...args: any[]) => any>(),
	})),
	findService: jest.fn<(...args: any[]) => any>(),
	listenExpress: jest.fn<(...args: any[]) => any>(),
};

jest.mock("../../src/address-manager", () => ({
	__esModule: true,
	default: jest
		.fn<(...args: any[]) => any>()
		.mockImplementation(() => MOCK_ADDRESS_MANAGER_INSTANCE),
}));

import { createAddressManager } from "../../src/create-address-manager";

describe("createAddressManager", () => {
	const MINIMAL_ENV = {};

	it("should create an AddressManager with the given env", () => {
		const am = createAddressManager(MINIMAL_ENV);
		expect(am).toBe(MOCK_ADDRESS_MANAGER_INSTANCE);
	});

	it("should parse DNS_NAME_MAP when provided", () => {
		const am = createAddressManager({
			...MINIMAL_ENV,
			DNS_NAME_MAP: { "discovery-service": "discovery-server" },
		});
		expect(am).toBe(MOCK_ADDRESS_MANAGER_INSTANCE);
	});
});
