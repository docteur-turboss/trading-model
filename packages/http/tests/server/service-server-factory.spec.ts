import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { ServiceId } from "@trading-model/primitives/primitives";

jest.mock("../../src/create-secure-server", () => ({
	buildTlsFromEnv: jest.fn((env: Record<string, string>) => ({
		keyPath: env.TLS_KEY_PATH,
		certPath: env.TLS_CERT_PATH,
		caPath: env.TLS_CA_PATH,
	})),
	createSecureServer: jest.fn((..._args: any[]) =>
		Promise.resolve({ close: jest.fn<(...args: any[]) => any>() })
	),
}));

import { createSecureServer } from "../../src/create-secure-server";
import { createServiceServer } from "../../src/service-server-factory";

const ENV = {
	PORT: 3000,
	TLS_KEY_PATH: "/key.pem",
	TLS_CERT_PATH: "/cert.pem",
	TLS_CA_PATH: "/ca.pem",
};

describe("createServiceServer", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("enables authorization by default", async () => {
		await createServiceServer({
			env: { ...ENV },
			serviceId: ServiceId.of("api-gateway"),
			routes: jest.fn<(...args: any[]) => any>(),
		});

		expect(createSecureServer).toHaveBeenCalledWith(
			expect.objectContaining({
				authorize: { targetService: "api-gateway" },
			})
		);
	});

	it("throws when authorization is enabled without a serviceId", () => {
		expect(() =>
			createServiceServer({
				env: { ...ENV },
				routes: jest.fn<(...args: any[]) => any>(),
			})
		).toThrow(/serviceId/);
	});
});
