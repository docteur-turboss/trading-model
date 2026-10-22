import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { ServiceId } from "@trading-model/primitives/primitives";

jest.mock("../src/adapters/inbound/create-secure-server", () => ({
	buildTlsFromEnv: jest.fn((env: Record<string, string>) => ({
		keyPath: env.TLS_KEY_PATH,
		certPath: env.TLS_CERT_PATH,
		caPath: env.TLS_CA_PATH,
	})),
	createSecureServer: jest.fn(() =>
		Promise.resolve({ raw: {}, close: jest.fn() })
	),
}));

import { createSecureServer } from "../src/adapters/inbound/create-secure-server";
import { createServiceServer } from "../src/adapters/inbound/service-server-factory";

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

	it("does not enable authorization when ENFORCE_MTLS_STRICT is explicitly false", async () => {
		await createServiceServer({
			env: { ...ENV, ENFORCE_MTLS_STRICT: false },
			serviceId: ServiceId.of("api-gateway"),
			routes: jest.fn(),
		});

		expect(createSecureServer).toHaveBeenCalledWith(
			expect.objectContaining({ authorize: undefined })
		);
	});

	it("enables authorization by default (when ENFORCE_MTLS_STRICT is not set)", async () => {
		await createServiceServer({
			env: { ...ENV },
			serviceId: ServiceId.of("api-gateway"),
			routes: jest.fn(),
		});

		expect(createSecureServer).toHaveBeenCalledWith(
			expect.objectContaining({
				authorize: { enabled: true, targetService: "api-gateway" },
			})
		);
	});

	it("enables authorization when ENFORCE_MTLS_STRICT is true", async () => {
		await createServiceServer({
			env: { ...ENV, ENFORCE_MTLS_STRICT: true },
			serviceId: ServiceId.of("api-gateway"),
			routes: jest.fn(),
		});

		expect(createSecureServer).toHaveBeenCalledWith(
			expect.objectContaining({
				authorize: { enabled: true, targetService: "api-gateway" },
			})
		);
	});

	it("throws when authorization is enabled without a serviceId", () => {
		expect(() =>
			createServiceServer({
				env: { ...ENV },
				routes: jest.fn(),
			})
		).toThrow(/serviceId/);
	});
});
