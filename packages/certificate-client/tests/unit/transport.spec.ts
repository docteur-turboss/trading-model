import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type {
	ServiceId,
	URLString,
} from "@trading-model/common/domain/primitives";
import type { RevocationRequest } from "@trading-model/common/domain/revocation-request";
import type { TlsPaths } from "@trading-model/common/domain/tls-paths";

const MOCK_GET_CERTIFICATE = jest.fn<(...args: any[]) => any>();
const MOCK_REVOKE_CERTIFICATE = jest.fn<(...args: any[]) => any>();
const MOCK_GET_CRL = jest.fn<(...args: any[]) => any>();

const MOCK_STRATEGY_CURRENT_MODE = jest.fn<(...args: any[]) => any>();
const MOCK_STRATEGY_SIGN_CERTIFICATE = jest.fn<(...args: any[]) => any>();
const MOCK_STRATEGY_DISCONNECT = jest.fn<(...args: any[]) => any>();

jest.mock("@trading-model/crypto/ca/ca-client", () => ({
	CaClient: jest.fn(() => ({
		getCertificate: MOCK_GET_CERTIFICATE,
		revokeCertificate: MOCK_REVOKE_CERTIFICATE,
		getCrl: MOCK_GET_CRL,
	})),
}));

jest.mock("../../src/wss-fallback-strategy", () => ({
	WssFallbackStrategy: jest.fn(() => {
		const strategy: Record<string, unknown> = {};
		Object.defineProperty(strategy, "currentMode", {
			get: () => MOCK_STRATEGY_CURRENT_MODE(),
			enumerable: true,
		});
		strategy.signCertificate = MOCK_STRATEGY_SIGN_CERTIFICATE;
		strategy.disconnect = MOCK_STRATEGY_DISCONNECT;
		return strategy;
	}),
	TransportMode: { Wss: "wss", Https: "https" },
}));

import { CaClient } from "@trading-model/crypto/ca/ca-client";
import { TransportManager, TransportMode } from "../../src/transport";
import { WssFallbackStrategy } from "../../src/wss-fallback-strategy";

describe("TransportManager", () => {
	const caUrl = "https://ca:8447" as URLString;
	const defaultConfig = { caUrl };

	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe("constructor", () => {
		it("should create a CaClient with the correct URL", () => {
			new TransportManager(defaultConfig);
			expect(CaClient).toHaveBeenCalledWith({
				baseUrl: caUrl,
				tls: undefined,
			});
		});

		it("should pass TLS config to CaClient when provided", () => {
			const tls = {
				caPath: "ca.pem",
				certPath: "cert.pem",
				keyPath: "key.pem",
			} as TlsPaths;
			new TransportManager({ caUrl, tls });
			expect(CaClient).toHaveBeenCalledWith({ baseUrl: caUrl, tls });
		});

		it("should create a WssFallbackStrategy with the config", () => {
			new TransportManager(defaultConfig);
			expect(WssFallbackStrategy).toHaveBeenCalledWith(defaultConfig);
		});

		it("should pass forceHttps and bootstrapToken to strategy", () => {
			const config = { caUrl, forceHttps: true, bootstrapToken: "token" };
			new TransportManager(config);
			expect(WssFallbackStrategy).toHaveBeenCalledWith(config);
		});
	});

	describe("currentMode", () => {
		it("should delegate to the strategy", () => {
			MOCK_STRATEGY_CURRENT_MODE.mockReturnValue(TransportMode.Wss);
			const manager = new TransportManager(defaultConfig);
			expect(manager.currentMode).toBe(TransportMode.Wss);
			expect(MOCK_STRATEGY_CURRENT_MODE).toHaveBeenCalled();
		});

		it("should return the HTTPS mode from strategy", () => {
			MOCK_STRATEGY_CURRENT_MODE.mockReturnValue(TransportMode.Https);
			const manager = new TransportManager(defaultConfig);
			expect(manager.currentMode).toBe(TransportMode.Https);
		});
	});

	describe("signCertificate", () => {
		it("should delegate to the strategy with request and httpsClient", async () => {
			const request = { serviceId: "test" as ServiceId, csr: "csr" };
			const expected = { certPem: "cert" };
			MOCK_STRATEGY_SIGN_CERTIFICATE.mockResolvedValue(expected);
			const manager = new TransportManager(defaultConfig);
			const result = await manager.signCertificate(request as any);
			expect(MOCK_STRATEGY_SIGN_CERTIFICATE).toHaveBeenCalledWith(
				request,
				expect.anything()
			);
			expect(result).toBe(expected);
		});
	});

	describe("getCertificate", () => {
		it("should delegate to the caClient", async () => {
			const serviceId = "my-service" as ServiceId;
			const expected = { certPem: "cert" };
			MOCK_GET_CERTIFICATE.mockResolvedValue(expected);
			const manager = new TransportManager(defaultConfig);
			const result = await manager.getCertificate(serviceId);
			expect(MOCK_GET_CERTIFICATE).toHaveBeenCalledWith(serviceId);
			expect(result).toBe(expected);
		});
	});

	describe("revokeCertificate", () => {
		it("should delegate to the caClient", async () => {
			const request = {} as RevocationRequest;
			MOCK_REVOKE_CERTIFICATE.mockResolvedValue(undefined);
			const manager = new TransportManager(defaultConfig);
			await manager.revokeCertificate(request);
			expect(MOCK_REVOKE_CERTIFICATE).toHaveBeenCalledWith(request);
		});
	});

	describe("getCrl", () => {
		it("should delegate to the caClient without a since argument", async () => {
			const expected = { entries: [] };
			MOCK_GET_CRL.mockResolvedValue(expected);
			const manager = new TransportManager(defaultConfig);
			const result = await manager.getCrl();
			expect(MOCK_GET_CRL).toHaveBeenCalledWith(undefined);
			expect(result).toBe(expected);
		});

		it("should pass since to the caClient", async () => {
			MOCK_GET_CRL.mockResolvedValue({});
			const manager = new TransportManager(defaultConfig);
			await manager.getCrl("2024-01-01");
			expect(MOCK_GET_CRL).toHaveBeenCalledWith("2024-01-01");
		});
	});

	describe("disconnect", () => {
		it("should delegate to the strategy", () => {
			const manager = new TransportManager(defaultConfig);
			manager.disconnect();
			expect(MOCK_STRATEGY_DISCONNECT).toHaveBeenCalled();
		});
	});

	describe("destroy", () => {
		it("should call disconnect", () => {
			const manager = new TransportManager(defaultConfig);
			const disconnectSpy = jest.spyOn(manager, "disconnect");
			manager.disconnect();
			expect(disconnectSpy).toHaveBeenCalled();
		});
	});
});
