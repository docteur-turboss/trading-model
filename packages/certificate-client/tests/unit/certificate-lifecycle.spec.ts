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
	UnixTimestamp,
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
	KeyAlgorithm: { EcP384: "ec-p384" },
}));

const MOCK_SIGN = jest.fn();
jest.mock("@trading-model/crypto/ca/ca-client", () => ({
	CaClient: jest.fn(() => ({
		signCertificate: MOCK_SIGN,
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
import type { ServiceId } from "@trading-model/common/domain/primitives";
import { CaClient } from "@trading-model/crypto/ca/ca-client";
import { CertificateLifecycle } from "../../src/certificate-lifecycle";

function mockResolved<T>(mock: unknown, value: T): void {
	(mock as any).mockResolvedValue(value);
}

describe("CertificateLifecycle", () => {
	const config = {
		caUrl: "https://ca:8447",
		serviceId: "my-service" as ServiceId,
		commonName: "my-service",
		san: ["my-service", "localhost"],
		tlsPaths: {
			certPath: FilePath.of("/etc/tls/cert.pem"),
			keyPath: FilePath.of("/etc/tls/key.pem"),
			caPath: FilePath.of("/etc/tls/ca.pem"),
		},
	};
	let lifecycle: CertificateLifecycle;

	beforeEach(() => {
		jest.clearAllMocks();
		jest.useFakeTimers();
		const caClient = new CaClient({ baseUrl: "https://ca:8447" as any });
		lifecycle = new CertificateLifecycle(config as any, caClient);
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	describe("generateKeyAndCsr", () => {
		it("should generate key pair and CSR with default key algorithm", async () => {
			mockResolved(generateKeyPairAsync, {
				privateKey: "pk-pem" as any,
				publicKey: "pub-pem" as any,
			});
			mockResolved(
				createCsrAsync,
				"-----BEGIN CSR-----\nAAAA\n-----END CSR-----" as any
			);

			const result = await lifecycle.generateKeyAndCsr();

			expect(generateKeyPairAsync).toHaveBeenCalledWith(expect.any(String));
			expect(createCsrAsync).toHaveBeenCalledWith({
				commonName: "my-service",
				san: ["my-service", "localhost"],
				keyPem: "pk-pem" as any,
			});
			expect(result).toEqual({
				keyPair: { privateKey: "pk-pem" as any, publicKey: "pub-pem" as any },
				csr: "-----BEGIN CSR-----\nAAAA\n-----END CSR-----",
			});
		});
	});

	describe("signWithCa", () => {
		const pemCsr =
			"-----BEGIN CERTIFICATE REQUEST-----\nAAAA\n-----END CERTIFICATE REQUEST-----";

		it("should sign CSR without bootstrapToken", async () => {
			mockResolved(MOCK_SIGN, { certPem: "cert" as any, caPem: "ca" as any });

			const result = await lifecycle.signWithCa(pemCsr);

			expect(MOCK_SIGN).toHaveBeenCalledWith({
				serviceId: "my-service" as any,
				csr: pemCsr as any,
				bootstrapToken: undefined,
			});
			expect(result).toEqual({ certPem: "cert" as any, caPem: "ca" as any });
		});

		it("should sign CSR with bootstrapToken when configured", async () => {
			mockResolved(MOCK_SIGN, { certPem: "cert" as any, caPem: "ca" as any });
			const caClient = new CaClient({ baseUrl: "https://ca:8447" as any });
			const lc = new CertificateLifecycle(
				{ ...config, bootstrapToken: "btoken" } as any,
				caClient
			);
			mockResolved(MOCK_SIGN, { certPem: "cert" as any, caPem: "ca" as any });

			const result = await lc.signWithCa(pemCsr);

			expect(MOCK_SIGN).toHaveBeenCalledWith({
				serviceId: "my-service" as any,
				csr: pemCsr as any,
				bootstrapToken: "btoken" as any,
			});
			expect(result).toEqual({ certPem: "cert" as any, caPem: "ca" as any });
		});
	});

	describe("writeCertificates", () => {
		it("should create directory and write cert files with correct modes", async () => {
			await (lifecycle as any).writeCertificates(
				{ privateKey: "pk-data" },
				{ certPem: "cert-data" as any, caPem: "ca-data" as any }
			);

			expect(fs.mkdir).toHaveBeenCalledWith("/etc/tls", { recursive: true });
			expect(fs.writeFile).toHaveBeenCalledWith("/etc/tls/key.pem", "pk-data", {
				mode: 0o600,
			});
			expect(fs.writeFile).toHaveBeenCalledWith(
				"/etc/tls/cert.pem",
				"cert-data",
				{ mode: 0o644 }
			);
			expect(fs.writeFile).toHaveBeenCalledWith("/etc/tls/ca.pem", "ca-data", {
				mode: 0o644,
			});
		});
	});

	describe("buildObtainedCert", () => {
		it("should build ObtainedCertificate from keyPair and response", () => {
			const keyPair = {
				privateKey: "pk-data" as any,
				publicKey: "pub-data" as any,
			};
			const response = {
				certPem: "cert-pem" as any,
				caPem: "ca-pem" as any,
				serialNumber: "SN123" as any,
				expiresAt: "2027-06-15T00:00:00.000Z",
			};

			const result = (lifecycle as any).buildObtainedCert(keyPair, response);

			expect(result).toEqual({
				certPem: "cert-pem",
				keyPem: "pk-data",
				caPem: "ca-pem",
				serialNumber: "SN123",
				expiresAt: UnixTimestamp.of(
					new Date("2027-06-15T00:00:00.000Z").getTime()
				),
			});
		});
	});

	describe("notifyOnRenew", () => {
		it("should call onRenew callback via setImmediate when provided", async () => {
			jest.useRealTimers();
			const onRenew = jest.fn();
			const cert = {
				certPem: "cert" as any,
				keyPem: "key" as any,
				caPem: "ca" as any,
				serialNumber: "SN" as any,
				expiresAt: 0 as any,
			};

			(lifecycle as any).notifyOnRenew(onRenew, cert);
			await new Promise<void>((resolve) => setImmediate(resolve));

			expect(onRenew).toHaveBeenCalledWith(cert);
		});

		it("should not throw when onRenew is undefined", () => {
			const cert = {
				certPem: "cert" as any,
				keyPem: "key" as any,
				caPem: "ca" as any,
				serialNumber: "SN" as any,
				expiresAt: 0 as any,
			};

			expect(() =>
				(lifecycle as any).notifyOnRenew(undefined, cert)
			).not.toThrow();
		});
	});
});
