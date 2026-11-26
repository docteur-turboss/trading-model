import { describe, expect, it, jest } from "@jest/globals";

const AM = { findService: jest.fn<(...args: any[]) => any>(() => "svc") };

jest.mock("../../src/create-address-manager", () => ({
	createAddressManager: jest.fn<(...args: any[]) => any>(() => AM),
}));

import { createServiceAddressManager } from "../../src/create-service-address-manager";

describe("createServiceAddressManager", () => {
	it("exposes the manager and a lookup bound to it", () => {
		const out = createServiceAddressManager({});
		expect(out.AddressManager).toBe(AM);
		expect(out.FIND_A_SERVICE("api-gateway" as never)).toBe("svc");
		expect(AM.findService).toHaveBeenCalledWith("api-gateway");
	});
});
