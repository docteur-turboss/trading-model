import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockWssSign = jest.fn<(...args: any[]) => Promise<any>>();
const mockWssDisconnect = jest.fn<(...args: any[]) => any>();

let mockWssIsConnected = false;
let mockWssIsAuthSent = false;

jest.mock("../../src/wss-transport", () => ({
	CaWssTransport: jest.fn<(...args: any[]) => any>().mockImplementation(() => ({
		get isConnected() {
			return mockWssIsConnected;
		},
		get isAuthSent() {
			return mockWssIsAuthSent;
		},
		signCertificate: mockWssSign,
		disconnect: mockWssDisconnect,
	})),
	NULL_CA_WSS_TRANSPORT: {
		isConnected: false,
		isAuthSent: false,
		signCertificate: jest.fn<(...args: any[]) => Promise<any>>(),
		disconnect: jest.fn<(...args: any[]) => any>(),
	},
}));

jest.mock("@trading-model/common/config/logger", () => ({
	logger: {
		error: jest.fn<(...args: any[]) => any>(),
		warn: jest.fn<(...args: any[]) => any>(),
	},
}));

import {
	TransportMode,
	WssFallbackStrategy,
} from "../../src/wss-fallback-strategy";
import { CaWssTransport } from "../../src/wss-transport";

const mockHttpsSign = jest.fn<(...args: any[]) => Promise<any>>();
const httpsClient = { signCertificate: mockHttpsSign };

beforeEach(() => {
	jest.clearAllMocks();
	mockWssIsConnected = false;
	mockWssIsAuthSent = false;
	mockWssSign.mockRejectedValue(new Error("not connected"));
	mockHttpsSign.mockResolvedValue({
		certPem: "cert",
		caPem: "ca",
		serialNumber: "SN",
		expiresAt: "2027-01-01",
	});
});

describe("WssFallbackStrategy", () => {
	describe("constructor", () => {
		it("should set mode to Https and use NULL transport when forceHttps is true", () => {
			const strategy = new WssFallbackStrategy({
				caUrl: "https://ca.example.com" as any,
				forceHttps: true,
			});

			expect(strategy.currentMode).toBe(TransportMode.Https);
			expect(CaWssTransport).not.toHaveBeenCalled();
		});

		it("should create CaWssTransport with WSS URL when forceHttps is not set", () => {
			const strategy = new WssFallbackStrategy({
				caUrl: "https://ca.example.com" as any,
			});

			expect(strategy.currentMode).toBe(TransportMode.Wss);
			expect(CaWssTransport).toHaveBeenCalledWith({
				wsUrl: "wss://ca.example.com",
			});
		});

		it("should convert http URL to ws URL", () => {
			new WssFallbackStrategy({
				caUrl: "http://ca.example.com" as any,
			});

			expect(CaWssTransport).toHaveBeenCalledWith({
				wsUrl: "ws://ca.example.com",
			});
		});

		it("should strip trailing slashes from the URL", () => {
			new WssFallbackStrategy({
				caUrl: "https://ca.example.com///" as any,
			});

			expect(CaWssTransport).toHaveBeenCalledWith({
				wsUrl: "wss://ca.example.com",
			});
		});

		it("should pass tls config and bootstrapToken to CaWssTransport", () => {
			const tls = { key: "key", cert: "cert" };
			new WssFallbackStrategy({
				caUrl: "https://ca.example.com" as any,
				tls: tls as any,
				bootstrapToken: "my-token",
			});

			expect(CaWssTransport).toHaveBeenCalledWith({
				wsUrl: "wss://ca.example.com",
				tlsConfig: tls,
				bootstrapToken: "my-token",
			});
		});
	});

	describe("currentMode", () => {
		it("should return the current transport mode", () => {
			const strategy = new WssFallbackStrategy({
				caUrl: "https://ca.example.com" as any,
				forceHttps: true,
			});

			expect(strategy.currentMode).toBe(TransportMode.Https);
		});
	});

	describe("signCertificate", () => {
		it("should use WSS transport when connected and auth sent", async () => {
			mockWssIsConnected = true;
			mockWssIsAuthSent = true;
			mockWssSign.mockResolvedValue({
				certPem: "wss-cert",
				caPem: "ca",
				serialNumber: "SN",
				expiresAt: "2027-01-01",
			});

			const strategy = new WssFallbackStrategy({
				caUrl: "https://ca.example.com" as any,
			});

			const result = await strategy.signCertificate(
				{ serviceId: "svc-1", csr: "csr" } as any,
				httpsClient as any
			);

			expect(result.certPem).toBe("wss-cert");
			expect(mockWssSign).toHaveBeenCalledWith({
				serviceId: "svc-1",
				csr: "csr",
			});
			expect(mockHttpsSign).not.toHaveBeenCalled();
		});

		it("should fall back to HTTPS after max unauth rejects", async () => {
			mockWssIsConnected = true;
			mockWssIsAuthSent = false;
			mockWssSign.mockResolvedValue({
				certPem: "wss-cert",
				caPem: "ca",
				serialNumber: "SN",
				expiresAt: "2027-01-01",
			});

			const strategy = new WssFallbackStrategy({
				caUrl: "https://ca.example.com" as any,
			});

			await strategy.signCertificate({} as any, httpsClient as any);
			await strategy.signCertificate({} as any, httpsClient as any);
			await strategy.signCertificate({} as any, httpsClient as any);

			expect(mockWssSign).toHaveBeenCalledTimes(3);

			await strategy.signCertificate({} as any, httpsClient as any);

			expect(mockHttpsSign).toHaveBeenCalledTimes(1);
			expect(strategy.currentMode).toBe(TransportMode.Https);
		});

		it("should fall back to HTTPS when WSS sign fails", async () => {
			mockWssIsConnected = true;
			mockWssIsAuthSent = true;
			mockWssSign.mockRejectedValue(new Error("connection lost"));

			const strategy = new WssFallbackStrategy({
				caUrl: "https://ca.example.com" as any,
			});

			const result = await strategy.signCertificate(
				{ serviceId: "svc-1", csr: "csr" } as any,
				httpsClient as any
			);

			expect(result.certPem).toBe("cert");
			expect(mockWssSign).toHaveBeenCalled();
			expect(mockHttpsSign).toHaveBeenCalled();
		});

		it("should use HTTPS directly when mode is Https", async () => {
			const strategy = new WssFallbackStrategy({
				caUrl: "https://ca.example.com" as any,
				forceHttps: true,
			});

			const result = await strategy.signCertificate(
				{ serviceId: "svc-1", csr: "csr" } as any,
				httpsClient as any
			);

			expect(result.certPem).toBe("cert");
			expect(mockWssSign).not.toHaveBeenCalled();
			expect(mockHttpsSign).toHaveBeenCalled();
		});

		it("should use HTTPS when WSS is not connected", async () => {
			mockWssIsConnected = false;
			mockWssIsAuthSent = false;

			const strategy = new WssFallbackStrategy({
				caUrl: "https://ca.example.com" as any,
			});

			const result = await strategy.signCertificate(
				{ serviceId: "svc-1", csr: "csr" } as any,
				httpsClient as any
			);

			expect(result.certPem).toBe("cert");
			expect(mockWssSign).not.toHaveBeenCalled();
			expect(mockHttpsSign).toHaveBeenCalled();
		});

		it("should not increment unauthRejects when auth has been sent", async () => {
			mockWssIsConnected = true;
			mockWssIsAuthSent = true;
			mockWssSign.mockResolvedValue({
				certPem: "wss-cert",
				caPem: "ca",
				serialNumber: "SN",
				expiresAt: "2027-01-01",
			});

			const strategy = new WssFallbackStrategy({
				caUrl: "https://ca.example.com" as any,
			});

			await strategy.signCertificate({} as any, httpsClient as any);
			await strategy.signCertificate({} as any, httpsClient as any);
			await strategy.signCertificate({} as any, httpsClient as any);
			await strategy.signCertificate({} as any, httpsClient as any);

			expect(strategy.currentMode).toBe(TransportMode.Wss);
			expect(mockWssSign).toHaveBeenCalledTimes(4);
		});
	});

	describe("disconnect", () => {
		it("should delegate to WSS transport disconnect", () => {
			const strategy = new WssFallbackStrategy({
				caUrl: "https://ca.example.com" as any,
			});

			strategy.disconnect();

			expect(mockWssDisconnect).toHaveBeenCalled();
		});

		it("should not throw when using NULL transport", () => {
			const strategy = new WssFallbackStrategy({
				caUrl: "https://ca.example.com" as any,
				forceHttps: true,
			});

			expect(() => strategy.disconnect()).not.toThrow();
		});
	});
});
