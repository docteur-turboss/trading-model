import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const MOCK_CREATE_PUBLIC_KEY = jest.fn();
const MOCK_CREATE_SIGN = jest.fn();
const MOCK_CREATE_HASH = jest.fn();
const MOCK_RANDOM_UUID = jest.fn();

jest.mock("node:crypto", () => ({
	createPublicKey: MOCK_CREATE_PUBLIC_KEY,
	createSign: MOCK_CREATE_SIGN,
	createHash: MOCK_CREATE_HASH,
	randomUUID: MOCK_RANDOM_UUID,
}));

let mockExistsSync: jest.Mock;
let mockReadFileSync: jest.Mock;
let mockWriteFileSync: jest.Mock;
let mockMkdirSync: jest.Mock;

jest.mock("node:fs", () => {
	mockExistsSync = jest.fn();
	mockReadFileSync = jest.fn();
	mockWriteFileSync = jest.fn();
	mockMkdirSync = jest.fn();
	return {
		existsSync: mockExistsSync,
		readFileSync: mockReadFileSync,
		writeFileSync: mockWriteFileSync,
		mkdirSync: mockMkdirSync,
	};
});

jest.mock("@trading-model/certificate-utils/generate-key-pair", () => ({
	KeyAlgorithm: { rsa4096: "rsa", ecP384: "ec" },
	generateKeyPair: jest.fn(),
}));

jest.mock("@trading-model/certificate-utils/sign-certificate", () => ({
	signCertificate: jest.fn(),
}));

jest.mock("../../src/config/env", () => ({
	ENV: { CERT_DEFAULT_TTL_MS: 604800000 },
}));

import { generateKeyPair } from "@trading-model/certificate-utils/generate-key-pair";
import { signCertificate } from "@trading-model/certificate-utils/sign-certificate";
import { CertificateAuthority } from "../../src/core/ca";

const MOCK_CERT_STORE = {
	connect: jest.fn(),
	disconnect: jest.fn(),
	save: jest.fn(),
	getBySerial: jest.fn(),
	getByServiceId: jest.fn(),
	getExpiring: jest.fn(),
};

const MOCK_CRL_STORE = {
	connect: jest.fn(),
	disconnect: jest.fn(),
	add: jest.fn(),
	getAll: jest.fn(),
	isRevoked: jest.fn(),
};

const MOCK_CA_STORE = {
	connect: jest.fn(),
	disconnect: jest.fn(),
	save: jest.fn(),
	getLatest: jest.fn(),
};

async function createCa() {
	return CertificateAuthority.create({
		caKeyPath: "/etc/ca-keys/ca-key.pem",
		caCertTtlMs: 31536000000,
		certificateStore: MOCK_CERT_STORE as any,
		crlStore: MOCK_CRL_STORE as any,
		caStore: MOCK_CA_STORE as any,
	});
}

function setupBootstrapMocks() {
	const mockSign: any = {
		update: jest.fn(),
		sign: jest.fn().mockReturnValue("fake-signature"),
	};
	const mockHash: any = {
		update: jest.fn(),
		digest: jest.fn().mockReturnValue("fake-fingerprint"),
	};
	mockHash.update.mockReturnValue(mockHash);
	MOCK_CREATE_PUBLIC_KEY.mockReturnValue({
		export: jest.fn().mockReturnValue("fake-public-key-pem"),
	});
	MOCK_CREATE_SIGN.mockReturnValue(mockSign);
	MOCK_CREATE_HASH.mockReturnValue(mockHash);
	MOCK_RANDOM_UUID.mockReturnValue("550e8400-e29b-41d4-a716-446655440000");
}

describe("CertificateAuthority", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe("initialize", () => {
		it("should bootstrap CA when no key file exists", async () => {
			setupBootstrapMocks();
			mockExistsSync.mockReturnValue(false);
			(generateKeyPair as jest.Mock).mockReturnValue({
				publicKey:
					"-----BEGIN PUBLIC KEY-----\nfake-public\n-----END PUBLIC KEY-----",
				privateKey:
					"-----BEGIN PRIVATE KEY-----\nfake-private\n-----END PRIVATE KEY-----",
			});
			MOCK_CA_STORE.getLatest.mockResolvedValue(null);
			MOCK_CA_STORE.save.mockResolvedValue(undefined);

			const ca = await createCa();

			expect(mockExistsSync).toHaveBeenCalledWith("/etc/ca-keys/ca-key.pem");
			expect(generateKeyPair).toHaveBeenCalled();
			expect(mockWriteFileSync).toHaveBeenCalled();
			expect(MOCK_CA_STORE.save).toHaveBeenCalled();
			expect(ca.isInitialized()).toBe(true);
		});

		it("should load existing CA key and cert from store", async () => {
			setupBootstrapMocks();
			mockExistsSync.mockReturnValue(true);
			mockReadFileSync.mockReturnValue(
				"-----BEGIN PRIVATE KEY-----\nexisting-key\n-----END PRIVATE KEY-----"
			);
			MOCK_CA_STORE.getLatest.mockResolvedValue({
				id: "SN-001",
				caCertPem:
					"-----BEGIN CERTIFICATE-----\nexisting-cert\n-----END CERTIFICATE-----",
				createdAt: new Date(),
				expiresAt: new Date(Date.now() + 3600000),
				fingerprint: "abc123",
			});

			const ca = createCa();
			await ca.initialize();

			expect(mockReadFileSync).toHaveBeenCalledWith(
				"/etc/ca-keys/ca-key.pem",
				"utf8"
			);
			expect(ca.getCaCertPem()).toContain("existing-cert");
			expect(ca.isInitialized()).toBe(true);
			expect(generateKeyPair).not.toHaveBeenCalled();
		});

		it("should bootstrap when key exists but no stored CA metadata", async () => {
			setupBootstrapMocks();
			mockExistsSync.mockReturnValue(true);
			mockReadFileSync.mockReturnValue(
				"-----BEGIN PRIVATE KEY-----\nkey\n-----END PRIVATE KEY-----"
			);
			MOCK_CA_STORE.getLatest.mockResolvedValue(null);
			(generateKeyPair as jest.Mock).mockReturnValue({
				publicKey: "pk",
				privateKey: "sk",
			});

			const ca = createCa();
			await ca.initialize();

			expect(generateKeyPair).toHaveBeenCalled();
			expect(MOCK_CA_STORE.save).toHaveBeenCalled();
		});
	});

	describe("signServiceCertificate", () => {
		it("should throw if CA not initialized", async () => {
			const ca = createCa();

			await expect(
				ca.signServiceCertificate({ serviceId: "svc-1", csr: "csr-data" })
			).rejects.toThrow("CA not initialized");
		});

		it("should sign a certificate and save to store", async () => {
			setupBootstrapMocks();
			mockExistsSync.mockReturnValue(false);
			(generateKeyPair as jest.Mock).mockReturnValue({
				publicKey:
					"-----BEGIN PUBLIC KEY-----\nfake-public\n-----END PUBLIC KEY-----",
				privateKey:
					"-----BEGIN PRIVATE KEY-----\nfake-private\n-----END PRIVATE KEY-----",
			});
			MOCK_CA_STORE.getLatest.mockResolvedValue(null);

			(signCertificate as jest.Mock).mockReturnValue({
				serialNumber: "SN-TEST",
				certPem:
					"-----BEGIN CERTIFICATE-----\nfake-cert\n-----END CERTIFICATE-----",
				caPem: "-----BEGIN PUBLIC KEY-----\nfake-ca\n-----END PUBLIC KEY-----",
				serviceId: "svc-1",
				issuedAt: new Date(),
				expiresAt: new Date(Date.now() + 3600000),
				fingerprint: "fp123",
			});

			const ca = createCa();
			await ca.initialize();

			const result = await ca.signServiceCertificate({ serviceId: "svc-1", csr: "csr-data" });

			expect(signCertificate).toHaveBeenCalled();
			expect(MOCK_CERT_STORE.save).toHaveBeenCalled();
			expect(result.serialNumber).toBe("SN-TEST");
			expect(result.serviceId).toBe("svc-1");
		});
	});

	describe("revokeCertificate", () => {
		it("should throw if certificate not found", async () => {
			setupBootstrapMocks();
			mockExistsSync.mockReturnValue(false);
			(generateKeyPair as jest.Mock).mockReturnValue({
				publicKey: "pk",
				privateKey: "sk",
			});
			MOCK_CA_STORE.getLatest.mockResolvedValue(null);
			MOCK_CERT_STORE.getBySerial.mockResolvedValue(null);

			const ca = createCa();
			await ca.initialize();

			await expect(
				ca.revokeCertificate({
					serialNumber: "SN-MISSING",
					reason: "key_compromise",
				})
			).rejects.toThrow("Certificate SN-MISSING not found");
			expect(MOCK_CRL_STORE.add).not.toHaveBeenCalled();
		});

		it("should add revoked cert to CRL store", async () => {
			setupBootstrapMocks();
			mockExistsSync.mockReturnValue(false);
			(generateKeyPair as jest.Mock).mockReturnValue({
				publicKey: "pk",
				privateKey: "sk",
			});
			MOCK_CA_STORE.getLatest.mockResolvedValue(null);
			MOCK_CERT_STORE.getBySerial.mockResolvedValue({
				serialNumber: "SN-REVOKE",
				serviceId: "svc-revoke",
				certPem: "cert",
				caPem: "ca",
				issuedAt: new Date(),
				expiresAt: new Date(Date.now() + 3600000),
				fingerprint: "fp",
			});

			const ca = createCa();
			await ca.initialize();
			jest.clearAllMocks();

			await ca.revokeCertificate({
				serialNumber: "SN-REVOKE",
				reason: "cessation_of_operation",
			});

			expect(MOCK_CRL_STORE.add).toHaveBeenCalledWith(
				expect.objectContaining({
					serialNumber: "SN-REVOKE",
					serviceId: "svc-revoke",
					reason: "cessation_of_operation",
				})
			);
		});
	});

	describe("getCrl", () => {
		it("should return all revoked certificates", async () => {
			setupBootstrapMocks();
			mockExistsSync.mockReturnValue(false);
			(generateKeyPair as jest.Mock).mockReturnValue({
				publicKey: "pk",
				privateKey: "sk",
			});
			MOCK_CA_STORE.getLatest.mockResolvedValue(null);
			MOCK_CRL_STORE.getAll.mockResolvedValue([
				{
					serialNumber: "SN-REVOKED",
					serviceId: "svc-1",
					revokedAt: new Date(),
					reason: "test",
				},
			]);

			const ca = createCa();
			await ca.initialize();

			const crl = await ca.getCrl();

			expect(crl).toHaveLength(1);
			expect(crl[0].serialNumber).toBe("SN-REVOKED");
		});
	});

	describe("isInitialized", () => {
		it("should return false before initialization", () => {
			const ca = createCa();
			expect(ca.isInitialized()).toBe(false);
		});

		it("should return true after bootstrapping", async () => {
			setupBootstrapMocks();
			mockExistsSync.mockReturnValue(false);
			(generateKeyPair as jest.Mock).mockReturnValue({
				publicKey: "pk",
				privateKey: "sk",
			});
			MOCK_CA_STORE.getLatest.mockResolvedValue(null);

			const ca = createCa();
			await ca.initialize();

			expect(ca.isInitialized()).toBe(true);
		});
	});

	describe("getCaCertPem", () => {
		it("should return empty string before initialization", () => {
			const ca = createCa();
			expect(ca.getCaCertPem()).toBe("");
		});
	});
});
