import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockLoadTlsPemBundle =
	jest.fn<() => { caPem?: string; certPem?: string; keyPem?: string }>();
jest.mock("@trading-model/common/config/http-tls-loader", () => ({
	loadTlsPemBundle: mockLoadTlsPemBundle,
}));

import { TlsConfigBuilder } from "../../src/tls-config-builder";

describe("TlsConfigBuilder", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("should build config with TLS options when TLS paths provided", () => {
		mockLoadTlsPemBundle.mockReturnValue({
			caPem: "ca-content",
			certPem: "cert-content",
			keyPem: "key-content",
		});

		const builder = new TlsConfigBuilder({
			caPath: "/ca.pem" as any,
			certPath: "/cert.pem" as any,
			keyPath: "/key.pem" as any,
		});

		const result = builder.build();

		expect(result.ca).toBe("ca-content");
		expect(result.cert).toBe("cert-content");
		expect(result.key).toBe("key-content");
		expect(result.rejectUnauthorized).toBe(true);
		expect(result.minVersion).toBe("TLSv1.3");
	});

	it("should build config without TLS options when no TLS paths", () => {
		const builder = new TlsConfigBuilder();
		const result = builder.build();

		expect(result.ca).toBeUndefined();
		expect(result.cert).toBeUndefined();
		expect(result.key).toBeUndefined();
		expect(result.rejectUnauthorized).toBeUndefined();
		expect(result.minVersion).toBe("TLSv1.3");
	});

	it("should skip undefined PEM fields", () => {
		mockLoadTlsPemBundle.mockReturnValue({
			caPem: undefined,
			certPem: undefined,
			keyPem: undefined,
		});

		const builder = new TlsConfigBuilder({
			caPath: "/ca.pem" as any,
			certPath: "/cert.pem" as any,
			keyPath: "/key.pem" as any,
		});

		const result = builder.build();

		expect(result.ca).toBeUndefined();
		expect(result.cert).toBeUndefined();
		expect(result.key).toBeUndefined();
	});
});
