jest.mock("@trading-model/common/config/http-client", () => {
	const mockPost = jest.fn();
	const mockGet = jest.fn();
	const mockInstance = { post: mockPost, get: mockGet };
	const HttpClient = Object.assign(
		jest.fn().mockImplementation(() => mockInstance),
		{ createWithTls: jest.fn().mockReturnValue(mockInstance) }
	);
	return { HttpClient, mockPost, mockGet };
});

import { ServiceId } from "@trading-model/common/domain/primitives";
import { CaClient } from "../src/ca/ca-client";

const { mockPost, mockGet } = jest.requireMock(
	"@trading-model/common/config/http-client"
) as {
	mockPost: jest.Mock;
	mockGet: jest.Mock;
	HttpClient: jest.Mock;
};

describe("CaClient", () => {
	let client: CaClient;

	beforeEach(() => {
		jest.clearAllMocks();
		client = new CaClient({
			baseUrl: "http://ca.local:8443" as never,
		});
	});

	describe("constructor", () => {
		it("should create a client without TLS config", () => {
			expect(client).toBeInstanceOf(CaClient);
		});

		it("should create a client with TLS config", () => {
			const tlsConfig = {
				caPath: "/etc/tls/ca.pem",
				certPath: "/etc/tls/cert.pem",
				keyPath: "/etc/tls/key.pem",
			} as never;
			const tlsClient = new CaClient({
				baseUrl: "https://ca.local:8443" as never,
				tls: tlsConfig,
			});
			expect(tlsClient).toBeInstanceOf(CaClient);
		});
	});

	describe("signCertificate", () => {
		it("should POST to /api/v1/certificate/sign with the request body", async () => {
			const serviceId = ServiceId.of("test-service");
			const csr = "-----BEGIN CERTIFICATE REQUEST-----\nMIIC...";

			mockPost.mockResolvedValueOnce({
				certPem: "-----BEGIN CERTIFICATE-----\nMIID...",
				caPem: "-----BEGIN CERTIFICATE-----\nMIIC...",
				serialNumber: "12345",
				fingerprint: "abc:def:123",
				expiresAt: "2026-01-01T00:00:00.000Z",
			});

			const result = await client.signCertificate({
				serviceId,
				csr,
				ttlMs: 3600000,
				bootstrapToken: "bt-123",
			});

			expect(mockPost).toHaveBeenCalledTimes(1);
			const [url, body] = mockPost.mock.calls[0];
			expect(url).toBe("http://ca.local:8443/api/v1/certificate/sign");
			expect(body).toEqual({
				serviceId: "test-service",
				csr,
				ttlMs: 3600000,
				bootstrapToken: "bt-123",
			});
			expect(result).toBeDefined();
			expect(result.certPem).toBe("-----BEGIN CERTIFICATE-----\nMIID...");
		});

		it("should throw on empty response", async () => {
			mockPost.mockResolvedValueOnce(undefined);

			await expect(
				client.signCertificate({
					serviceId: ServiceId.of("test-service"),
					csr: "CSR",
				})
			).rejects.toThrow("Empty response from CA sign endpoint");
		});

		it("should omit ttlMs and bootstrapToken when not provided", async () => {
			mockPost.mockResolvedValueOnce({
				serviceId: "svc",
				certPem: "cert",
				caPem: "ca",
				serialNumber: "1",
				fingerprint: "fp",
				expiresAt: "2026-01-01T00:00:00.000Z",
			});

			await client.signCertificate({
				serviceId: ServiceId.of("svc"),
				csr: "CSR",
			});

			const [, body] = mockPost.mock.calls[0];
			expect(body).toEqual({ serviceId: "svc", csr: "CSR" });
			expect(body).not.toHaveProperty("ttlMs");
			expect(body).not.toHaveProperty("bootstrapToken");
		});
	});

	describe("getCertificate", () => {
		it("should GET /api/v1/certificate/{serviceId}", async () => {
			const serviceId = ServiceId.of("my-service");
			const mockResponse = {
				serviceId: "my-service",
				certPem: "cert",
				caPem: "ca",
				serialNumber: "42",
				fingerprint: "12:34:56",
				expiresAt: "2026-06-01T00:00:00.000Z",
				issuedAt: "2025-06-01T00:00:00.000Z",
			};
			mockGet.mockResolvedValueOnce(mockResponse);

			const result = await client.getCertificate(serviceId);

			expect(mockGet).toHaveBeenCalledTimes(1);
			const [url] = mockGet.mock.calls[0];
			expect(url).toBe("http://ca.local:8443/api/v1/certificate/my-service");
			expect(result).toEqual(mockResponse);
		});

		it("should return null when no certificate exists (204)", async () => {
			mockGet.mockResolvedValueOnce(undefined);
			const result = await client.getCertificate(
				ServiceId.of("unknown-service")
			);
			expect(result).toBeNull();
		});

		it("should encode the serviceId in the URL", async () => {
			mockGet.mockResolvedValueOnce(undefined);
			await client.getCertificate(ServiceId.of("my service"));
			const [url] = mockGet.mock.calls[0];
			expect(url).toContain("/api/v1/certificate/my%20service");
		});
	});

	describe("revokeCertificate", () => {
		it("should POST to /api/v1/certificate/revoke with the request", async () => {
			mockPost.mockResolvedValueOnce(undefined);

			await client.revokeCertificate({
				serialNumber: "serial-abc" as never,
				reason: "compromised" as never,
			});

			expect(mockPost).toHaveBeenCalledTimes(1);
			const [url, body] = mockPost.mock.calls[0];
			expect(url).toBe("http://ca.local:8443/api/v1/certificate/revoke");
			expect(body).toEqual({
				serialNumber: "serial-abc",
				reason: "compromised",
			});
		});
	});

	describe("getCrl", () => {
		it("should GET /api/v1/crl without since parameter", async () => {
			mockGet.mockResolvedValueOnce([]);

			const result = await client.getCrl();

			expect(mockGet).toHaveBeenCalledTimes(1);
			const [url] = mockGet.mock.calls[0];
			expect(url).toBe("http://ca.local:8443/api/v1/crl");
			expect(result).toEqual([]);
		});

		it("should GET /api/v1/crl with since parameter", async () => {
			const since = "2025-01-01T00:00:00.000Z";
			mockGet.mockResolvedValueOnce([
				{
					serialNumber: "sn-1",
					serviceId: "svc",
					revokedAt: "2025-06-01T00:00:00.000Z",
					reason: "compromised",
				},
			]);

			const result = await client.getCrl(since);

			expect(mockGet).toHaveBeenCalledTimes(1);
			const [url] = mockGet.mock.calls[0];
			expect(url).toContain("/api/v1/crl?since=");
			expect(url).toContain(encodeURIComponent(since));
			expect(result).toHaveLength(1);
			expect(result[0].serialNumber).toBe("sn-1");
		});

		it("should return empty array when response is undefined", async () => {
			mockGet.mockResolvedValueOnce(undefined);
			const result = await client.getCrl();
			expect(result).toEqual([]);
		});
	});
});
