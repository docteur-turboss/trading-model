import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";
import {
	FilePath,
	type ServiceId,
	UnixTimestamp,
	URLString,
} from "@trading-model/common/domain/primitives";

jest.mock("node:fs/promises", () => ({
	mkdir: jest.fn(),
	writeFile: jest.fn(),
}));

jest.mock("@trading-model/certificate-utils/async", () => ({
	generateKeyPairAsync: jest.fn(),
	createCsrAsync: jest.fn(),
}));

jest.mock("@trading-model/certificate-utils/generate-key-pair", () => ({
	KeyAlgorithm: { ecP384: "ec-p384" },
}));

const MOCK_SIGN_CERTIFICATE = jest.fn();
const MOCK_GET_CERTIFICATE = jest.fn();
jest.mock("@trading-model/common/ca/ca-client", () => ({
	CaClient: jest.fn(() => ({
		signCertificate: MOCK_SIGN_CERTIFICATE,
		getCertificate: MOCK_GET_CERTIFICATE,
	})),
}));

jest.mock("@trading-model/common/config/logger", () => ({
	logger: {
		info: jest.fn(),
		error: jest.fn(),
		warn: jest.fn(),
		debug: jest.fn(),
	},
}));

import fs from "node:fs/promises";
import {
	createCsrAsync,
	generateKeyPairAsync,
} from "@trading-model/certificate-utils/async";
import { CaClient } from "@trading-model/common/ca/ca-client";
import { CertificateClient } from "../../src/certificate-client";

function mockResolved<T>(mock: unknown, value: T): void {
	(mock as any).mockResolvedValue(value);
}

describe("CertificateClient", () => {
	const defaultConfig = {
		caUrl: URLString.of("https://ca:8447"),
		serviceId: "my-service" as ServiceId,
		commonName: "my-service",
		san: ["my-service"],
		tlsPaths: {
			certPath: FilePath.of("/etc/tls/cert.pem"),
			keyPath: FilePath.of("/etc/tls/key.pem"),
			caPath: FilePath.of("/etc/tls/ca.pem"),
		},
	};

	beforeEach(() => {
		jest.clearAllMocks();
		jest.useFakeTimers();
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	describe("constructor", () => {
		it("should create a CaClient with the correct URL", () => {
			new CertificateClient(defaultConfig);
			expect(CaClient).toHaveBeenCalledWith({
				baseUrl: URLString.of("https://ca:8447"),
				tls: undefined,
			});
		});

		it("should pass TLS config to CaClient when provided", () => {
			const tlsPaths = {
				caPath: FilePath.of("/etc/tls/ca.pem"),
				certPath: FilePath.of("/etc/tls/cert.pem"),
				keyPath: FilePath.of("/etc/tls/key.pem"),
			};
			const configWithTls = { ...defaultConfig, tls: tlsPaths };
			new CertificateClient(configWithTls);
			expect(CaClient).toHaveBeenCalledWith({
				baseUrl: URLString.of("https://ca:8447"),
				tls: tlsPaths,
			});
		});
	});

	describe("obtainCertificate", () => {
		it("should generate key pair, create CSR, and sign certificate", async () => {
			mockResolved(generateKeyPairAsync, { privateKey: "private-key-pem" });
			mockResolved(
				createCsrAsync,
				"-----BEGIN CERTIFICATE REQUEST-----\nAAAA\n-----END CERTIFICATE REQUEST-----"
			);

			const signResponse = {
				certPem: "signed-cert-pem",
				caPem: "ca-cert-pem",
				serialNumber: "ABC123",
				expiresAt: "2027-06-15T00:00:00.000Z",
			};
			mockResolved(MOCK_SIGN_CERTIFICATE, signResponse);

			const client = new CertificateClient(defaultConfig);
			const holder = await client.obtainCertificate();

			expect(generateKeyPairAsync).toHaveBeenCalled();
			expect(createCsrAsync).toHaveBeenCalledWith({
				commonName: "my-service",
				san: ["my-service"],
				keyPem: "private-key-pem",
			});
			expect(MOCK_SIGN_CERTIFICATE).toHaveBeenCalledWith({
				serviceId: "my-service",
				csr: "-----BEGIN CERTIFICATE REQUEST-----\nAAAA\n-----END CERTIFICATE REQUEST-----",
				bootstrapToken: undefined,
			});
			expect(holder.getCurrentCert()).toEqual({
				certPem: "signed-cert-pem",
				keyPem: "private-key-pem",
				caPem: "ca-cert-pem",
				serialNumber: "ABC123",
				expiresAt: UnixTimestamp.of(
					new Date("2027-06-15T00:00:00.000Z").getTime()
				),
			});
		});

		it("should write cert files to disk", async () => {
			mockResolved(generateKeyPairAsync, { privateKey: "pk" });
			mockResolved(
				createCsrAsync,
				"-----BEGIN CERTIFICATE REQUEST-----\nAAAA\n-----END CERTIFICATE REQUEST-----"
			);
			mockResolved(MOCK_SIGN_CERTIFICATE, {
				certPem: "cert",
				caPem: "ca",
				serialNumber: "sn",
				expiresAt: "2027-06-15T00:00:00.000Z",
			});

			const client = new CertificateClient(defaultConfig);
			await client.obtainCertificate();

			expect(fs.mkdir).toHaveBeenCalledWith("/etc/tls", { recursive: true });
			expect(fs.writeFile).toHaveBeenCalledWith("/etc/tls/key.pem", "pk", {
				mode: 0o600,
			});
			expect(fs.writeFile).toHaveBeenCalledWith("/etc/tls/cert.pem", "cert", {
				mode: 0o644,
			});
			expect(fs.writeFile).toHaveBeenCalledWith("/etc/tls/ca.pem", "ca", {
				mode: 0o644,
			});
		});

		it("should pass bootstrapToken to signCertificate when configured", async () => {
			mockResolved(generateKeyPairAsync, { privateKey: "pk" });
			mockResolved(
				createCsrAsync,
				"-----BEGIN CERTIFICATE REQUEST-----\nAAAA\n-----END CERTIFICATE REQUEST-----"
			);
			mockResolved(MOCK_SIGN_CERTIFICATE, {
				certPem: "cert",
				caPem: "ca",
				serialNumber: "sn",
				expiresAt: "2027-06-15T00:00:00.000Z",
			});

			const client = new CertificateClient({
				...defaultConfig,
				bootstrapToken: "my-bootstrap-token",
			});
			await client.obtainCertificate();

			expect(MOCK_SIGN_CERTIFICATE).toHaveBeenCalledWith({
				serviceId: "my-service",
				csr: "-----BEGIN CERTIFICATE REQUEST-----\nAAAA\n-----END CERTIFICATE REQUEST-----",
				bootstrapToken: "my-bootstrap-token",
			});
		});

		it("should store obtained certificate and return it via getCurrentCert", async () => {
			mockResolved(generateKeyPairAsync, { privateKey: "pk" });
			mockResolved(
				createCsrAsync,
				"-----BEGIN CERTIFICATE REQUEST-----\nAAAA\n-----END CERTIFICATE REQUEST-----"
			);
			mockResolved(MOCK_SIGN_CERTIFICATE, {
				certPem: "cert",
				caPem: "ca",
				serialNumber: "sn",
				expiresAt: "2027-06-15T00:00:00.000Z",
			});

			const client = new CertificateClient(defaultConfig);
			const holder = await client.obtainCertificate();
			const current = holder.getCurrentCert();

			expect(current.certPem).toBe("cert");
			expect(current.keyPem).toBe("pk");
			expect(current.caPem).toBe("ca");
		});

		it("should call onRenew callback via setImmediate when configured", async () => {
			jest.useRealTimers();
			const onRenew = jest.fn();
			mockResolved(generateKeyPairAsync, { privateKey: "pk" });
			mockResolved(
				createCsrAsync,
				"-----BEGIN CERTIFICATE REQUEST-----\nAAAA\n-----END CERTIFICATE REQUEST-----"
			);
			mockResolved(MOCK_SIGN_CERTIFICATE, {
				certPem: "cert",
				caPem: "ca",
				serialNumber: "sn",
				expiresAt: "2027-06-15T00:00:00.000Z",
			});

			const client = new CertificateClient({
				...defaultConfig,
				onRenew,
			});
			await client.obtainCertificate();
			await new Promise<void>((resolve) => setImmediate(resolve));
			expect(onRenew).toHaveBeenCalledWith(
				expect.objectContaining({ certPem: "cert" })
			);
		});
	});

	describe("CertificateHolder", () => {
		it("should expose obtained certificate via getCurrentCert", async () => {
			mockResolved(generateKeyPairAsync, { privateKey: "pk" });
			mockResolved(
				createCsrAsync,
				"-----BEGIN CERTIFICATE REQUEST-----\nAAAA\n-----END CERTIFICATE REQUEST-----"
			);
			mockResolved(MOCK_SIGN_CERTIFICATE, {
				certPem: "cert",
				caPem: "ca",
				serialNumber: "sn",
				expiresAt: "2027-06-15T00:00:00.000Z",
			});

			const client = new CertificateClient(defaultConfig);
			const holder = await client.obtainCertificate();
			expect(holder.getCurrentCert().certPem).toBe("cert");
			expect(holder.getCurrentCert().keyPem).toBe("pk");
		});

		it("should not throw on stopAutoRenew when no timer is set", async () => {
			mockResolved(generateKeyPairAsync, { privateKey: "pk" });
			mockResolved(
				createCsrAsync,
				"-----BEGIN CERTIFICATE REQUEST-----\nAAAA\n-----END CERTIFICATE REQUEST-----"
			);
			mockResolved(MOCK_SIGN_CERTIFICATE, {
				certPem: "cert",
				caPem: "ca",
				serialNumber: "sn",
				expiresAt: "2027-06-15T00:00:00.000Z",
			});

			const client = new CertificateClient(defaultConfig);
			const holder = await client.obtainCertificate();
			expect(() => holder.stopAutoRenew()).not.toThrow();
		});

		it("should schedule renewal via startAutoRenew", async () => {
			mockResolved(generateKeyPairAsync, { privateKey: "pk" });
			mockResolved(
				createCsrAsync,
				"-----BEGIN CERTIFICATE REQUEST-----\nAAAA\n-----END CERTIFICATE REQUEST-----"
			);
			mockResolved(MOCK_SIGN_CERTIFICATE, {
				certPem: "cert",
				caPem: "ca",
				serialNumber: "sn",
				expiresAt: new Date(Date.now() + 86400000 * 365).toISOString(),
			});

			const client = new CertificateClient(defaultConfig);
			const holder = await client.obtainCertificate();

			jest.useFakeTimers();
			holder.startAutoRenew();
			await Promise.resolve();

			expect(jest.getTimerCount()).toBeGreaterThan(0);
		});

		it("should clear timer via stopAutoRenew", async () => {
			mockResolved(generateKeyPairAsync, { privateKey: "pk" });
			mockResolved(
				createCsrAsync,
				"-----BEGIN CERTIFICATE REQUEST-----\nAAAA\n-----END CERTIFICATE REQUEST-----"
			);
			mockResolved(MOCK_SIGN_CERTIFICATE, {
				certPem: "cert",
				caPem: "ca",
				serialNumber: "sn",
				expiresAt: new Date(Date.now() + 86400000 * 365).toISOString(),
			});

			const client = new CertificateClient(defaultConfig);
			const holder = await client.obtainCertificate();

			jest.useFakeTimers();
			holder.startAutoRenew();
			await Promise.resolve();
			expect(jest.getTimerCount()).toBeGreaterThan(0);

			holder.stopAutoRenew();
			expect(jest.getTimerCount()).toBe(0);
		});
	});

	describe("static createObtained", () => {
		it("should create client and obtain certificate", async () => {
			mockResolved(generateKeyPairAsync, { privateKey: "pk" });
			mockResolved(
				createCsrAsync,
				"-----BEGIN CERTIFICATE REQUEST-----\nAAAA\n-----END CERTIFICATE REQUEST-----"
			);
			mockResolved(MOCK_SIGN_CERTIFICATE, {
				certPem: "cert",
				caPem: "ca",
				serialNumber: "sn",
				expiresAt: "2027-06-15T00:00:00.000Z",
			});

			const holder = await CertificateClient.createObtained(defaultConfig);
			expect(holder.getCurrentCert().certPem).toBe("cert");
		});
	});

	describe("signCertificate", () => {
		it("should delegate to caClient.signCertificate", async () => {
			mockResolved(MOCK_SIGN_CERTIFICATE, {
				certPem: "signed",
				caPem: "ca",
				serialNumber: "sn",
				expiresAt: "2027-01-01T00:00:00.000Z",
			});

			const client = new CertificateClient(defaultConfig);
			const result = await client.signCertificate({
				serviceId: "svc" as any,
				csr: "csr" as any,
			});

			expect(MOCK_SIGN_CERTIFICATE).toHaveBeenCalledWith({
				serviceId: "svc",
				csr: "csr",
			});
			expect(result.certPem).toBe("signed");
		});
	});

	describe("getCertificate", () => {
		it("should delegate to caClient.getCertificate", async () => {
			mockResolved(MOCK_GET_CERTIFICATE, {
				certPem: "stored-cert",
				serialNumber: "sn",
			});

			const client = new CertificateClient(defaultConfig);
			const result = await client.getCertificate("some-service" as any);

			expect(MOCK_GET_CERTIFICATE).toHaveBeenCalledWith("some-service");
			expect(result!.certPem).toBe("stored-cert");
		});

		it("should return null when certificate not found", async () => {
			mockResolved(MOCK_GET_CERTIFICATE, null);

			const client = new CertificateClient(defaultConfig);
			const result = await client.getCertificate("unknown" as any);

			expect(result).toBeNull();
		});
	});
});
