import type https from "node:https";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockBuildHttpsAgentOptions = jest
	.fn<(tlsConfig?: unknown) => https.AgentOptions | undefined>()
	.mockReturnValue({});
jest.mock("@trading-model/common/config/http-tls-loader", () => ({
	buildHttpsAgentOptions: mockBuildHttpsAgentOptions,
}));

import { buildTlsConfig } from "../../src/tls-config-builder";

describe("buildTlsConfig", () => {
	beforeEach(() => {
		jest.resetAllMocks();
		mockBuildHttpsAgentOptions.mockReturnValue({});
	});

	it("should build config with TLS options when TLS paths provided", () => {
		mockBuildHttpsAgentOptions.mockReturnValue({
			ca: "ca-content" as unknown as undefined,
			cert: "cert-content" as unknown as undefined,
			key: "key-content" as unknown as undefined,
		});

		const result = buildTlsConfig({
			caPath: "/ca.pem" as any,
			certPath: "/cert.pem" as any,
			keyPath: "/key.pem" as any,
		});

		expect(result.ca).toBe("ca-content");
		expect(result.cert).toBe("cert-content");
		expect(result.key).toBe("key-content");
		expect(result.rejectUnauthorized).toBe(true);
		expect(result.minVersion).toBe("TLSv1.3");
	});

	it("should build config without TLS options when no TLS paths", () => {
		const result = buildTlsConfig();

		expect(result.ca).toBeUndefined();
		expect(result.cert).toBeUndefined();
		expect(result.key).toBeUndefined();
		expect(result.rejectUnauthorized).toBe(true);
		expect(result.minVersion).toBe("TLSv1.3");
	});

	it("should skip undefined PEM fields", () => {
		mockBuildHttpsAgentOptions.mockReturnValue({});

		const result = buildTlsConfig({
			caPath: "/ca.pem" as any,
			certPath: "/cert.pem" as any,
			keyPath: "/key.pem" as any,
		});

		expect(result.ca).toBeUndefined();
		expect(result.cert).toBeUndefined();
		expect(result.key).toBeUndefined();
	});
});
