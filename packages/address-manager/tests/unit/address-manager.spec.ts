import { describe, expect, it, jest } from "@jest/globals";

import type { ServiceInstanceName } from "@trading-model/common/config/services.types";

jest.mock("prom-client", () => ({
	Counter: jest.fn<(...args: any[]) => any>().mockReturnValue({
		inc: jest.fn<(...args: any[]) => any>(),
		reset: jest.fn<(...args: any[]) => any>(),
	}),
	Histogram: jest.fn<(...args: any[]) => any>().mockReturnValue({
		observe: jest.fn<(...args: any[]) => any>(),
		reset: jest.fn<(...args: any[]) => any>(),
	}),
	Gauge: jest.fn<(...args: any[]) => any>().mockReturnValue({
		set: jest.fn<(...args: any[]) => any>(),
		reset: jest.fn<(...args: any[]) => any>(),
	}),
	register: {
		clear: jest.fn<(...args: any[]) => any>(),
		contentType: "text/plain",
		metrics: jest
			.fn<(...args: any[]) => any>()
			.mockResolvedValue("metrics data"),
	},
}));

import { IPAddress, ServiceId } from "@trading-model/primitives/primitives";
import AddressManager from "../../src/address-manager";

type AddressManagerConfig = ConstructorParameters<typeof AddressManager>[0];

function makeConfig(
	overrides?: Partial<AddressManagerConfig>
): AddressManagerConfig {
	return { ...overrides };
}

describe("AddressManager (main)", () => {
	it("should create instance with minimal config", () => {
		const am = new AddressManager(makeConfig());
		expect(am).toBeInstanceOf(AddressManager);
	});

	it("should create instance with DNS name map", () => {
		const am = new AddressManager(
			makeConfig({
				dnsNameMap: {
					[ServiceId.of("test-service")]: IPAddress.of("127.0.0.1"),
				},
			})
		);
		expect(am).toBeInstanceOf(AddressManager);
	});

	it("finds a service at its canonical DNS name on port 3000, no registry asked", async () => {
		const am = new AddressManager(makeConfig());
		await expect(
			am.findService("financial-scraper" as ServiceInstanceName)
		).resolves.toEqual({ host: "financial-scraper", port: 3000 });
	});

	it("finds a service through DNS_NAME_MAP when the name is mapped", async () => {
		const am = new AddressManager(
			makeConfig({
				dnsNameMap: {
					[ServiceId.of("test-service")]: IPAddress.of("127.0.0.1"),
				},
			})
		);
		await expect(
			am.findService("test-service" as ServiceInstanceName)
		).resolves.toEqual({ host: "127.0.0.1", port: 3000 });
	});
});
