import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { RevocationReason } from "../../src/domain/revocation-request";

const MOCK_GET = jest.fn<any>();
const MOCK_POST = jest.fn<any>();

jest.mock("../../src/config/http-client", () => {
	const MockHttpClient: any = jest.fn(() => ({
		get: MOCK_GET,
		post: MOCK_POST,
		delete: jest.fn(),
	}));
	MockHttpClient.createWithTls = jest.fn(() => ({
		get: MOCK_GET,
		post: MOCK_POST,
		delete: jest.fn(),
	}));
	return { HttpClient: MockHttpClient };
});

import { CaClient } from "../../src/ca/ca-client";

describe("CaClient", () => {
	let client: CaClient;

	const signResponse = {
		cert: "-----BEGIN CERTIFICATE-----\nMII...\n-----END CERTIFICATE-----",
		caPem: "-----BEGIN CERTIFICATE-----\nMII...\n-----END CERTIFICATE-----",
		serialNumber: "1234567890abcdef",
		expiresAt: "2027-06-16T15:00:00Z",
		fingerprint: "SHA256:abc123...",
	};

	const getResponse = {
		cert: "-----BEGIN CERTIFICATE-----\nMII...\n-----END CERTIFICATE-----",
		caPem: "-----BEGIN CERTIFICATE-----\nMII...\n-----END CERTIFICATE-----",
		serialNumber: "abcdef1234567890",
		issuedAt: "2026-06-16T15:00:00Z",
		expiresAt: "2027-06-16T15:00:00Z",
		fingerprint: "SHA256:def456...",
	};

	beforeEach(() => {
		jest.clearAllMocks();
		client = new CaClient({ baseUrl: "https://ca.example.com:8443" });
	});

	describe("constructor", () => {
		it("should strip trailing slash from baseUrl", () => {
			const c = new CaClient({ baseUrl: "https://ca.example.com/" });
			expect(c).toBeInstanceOf(CaClient);
		});

		it("should create with TLS config", () => {
			const c = new CaClient({
				baseUrl: "https://ca.example.com",
		tls: {
				caPath: "/etc/ca.pem",
				certPath: "/etc/cert.pem",
				keyPath: "/etc/key.pem",
			},
			});
			expect(c).toBeInstanceOf(CaClient);
		});
	});

	describe("signCertificate", () => {
		it("should POST to the sign endpoint and return the signed certificate", async () => {
			MOCK_POST.mockResolvedValueOnce(signResponse);

			const result = await client.signCertificate(
				"my-service",
				"-----BEGIN CSR-----"
			);

			expect(MOCK_POST).toHaveBeenCalledWith(
				"https://ca.example.com:8443/api/v1/certificate/sign",
				{
					serviceId: "my-service",
					csr: "-----BEGIN CSR-----",
				}
			);
			expect(result).toEqual(signResponse);
		});

		it("should include optional ttlMs and bootstrapToken", async () => {
			MOCK_POST.mockResolvedValueOnce(signResponse);

			await client.signCertificate("my-service", "csr", {
				ttlMs: 86400000,
				bootstrapToken: "token-123",
			});

			expect(MOCK_POST).toHaveBeenCalledWith(
				"https://ca.example.com:8443/api/v1/certificate/sign",
				{
					serviceId: "my-service",
					csr: "csr",
					ttlMs: 86400000,
					bootstrapToken: "token-123",
				}
			);
		});

		it("should throw when response is empty", async () => {
			MOCK_POST.mockResolvedValueOnce(undefined);

			await expect(client.signCertificate("my-service", "csr")).rejects.toThrow(
				"Empty response from CA sign endpoint"
			);
		});

		it("should propagate HttpClient errors", async () => {
			MOCK_POST.mockRejectedValueOnce(new Error("Connection refused"));

			await expect(client.signCertificate("my-service", "csr")).rejects.toThrow(
				"Connection refused"
			);
		});
	});

	describe("getCertificate", () => {
		it("should GET the certificate for a service", async () => {
			MOCK_GET.mockResolvedValueOnce(getResponse);

			const result = await client.getCertificate("my-service");

			expect(MOCK_GET).toHaveBeenCalledWith(
				"https://ca.example.com:8443/api/v1/certificate/my-service"
			);
			expect(result).toEqual(getResponse);
		});

		it("should return null on 204 No Content", async () => {
			MOCK_GET.mockResolvedValueOnce(undefined);

			const result = await client.getCertificate("my-service");

			expect(result).toBeNull();
		});

		it("should URL-encode the serviceId", async () => {
			MOCK_GET.mockResolvedValueOnce(getResponse);

			await client.getCertificate("my service/foo");

			expect(MOCK_GET).toHaveBeenCalledWith(
				"https://ca.example.com:8443/api/v1/certificate/my%20service%2Ffoo"
			);
		});
	});

	describe("revokeCertificate", () => {
		it("should POST to the revoke endpoint", async () => {
			MOCK_POST.mockResolvedValueOnce(undefined);

			await client.revokeCertificate({
				serialNumber: "serial-123",
				reason: RevocationReason.KEY_COMPROMISE,
			});

			expect(MOCK_POST).toHaveBeenCalledWith(
				"https://ca.example.com:8443/api/v1/certificate/revoke",
				{ serialNumber: "serial-123", reason: RevocationReason.KEY_COMPROMISE }
			);
		});

		it("should propagate HttpClient errors", async () => {
			MOCK_POST.mockRejectedValueOnce(new Error("Timeout"));

			await expect(
				client.revokeCertificate({
					serialNumber: "serial-123",
					reason: RevocationReason.KEY_COMPROMISE,
				})
			).rejects.toThrow("Timeout");
		});
	});

	describe("getCrl", () => {
		it("should GET the CRL without since parameter", async () => {
			MOCK_GET.mockResolvedValueOnce([
				{
					serialNumber: "sn-1",
					serviceId: "svc",
					revokedAt: "2026-01-01T00:00:00Z",
					reason: "expired",
				},
			]);

			const result = await client.getCrl();

			expect(MOCK_GET).toHaveBeenCalledWith(
				"https://ca.example.com:8443/api/v1/crl"
			);
			expect(result).toHaveLength(1);
			expect(result[0].serialNumber).toBe("sn-1");
		});

		it("should GET the CRL with since parameter", async () => {
			MOCK_GET.mockResolvedValueOnce([]);

			const result = await client.getCrl("2026-01-01T00:00:00Z");

			expect(MOCK_GET).toHaveBeenCalledWith(
				"https://ca.example.com:8443/api/v1/crl?since=2026-01-01T00%3A00%3A00Z"
			);
			expect(result).toEqual([]);
		});

		it("should return empty array when response is null", async () => {
			MOCK_GET.mockResolvedValueOnce(undefined);

			const result = await client.getCrl();

			expect(result).toEqual([]);
		});
	});
});
