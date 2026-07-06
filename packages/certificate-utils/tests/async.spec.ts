import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const MOCK_EXECUTE = jest.fn<any>();
const MOCK_GENERATE_KEY_PAIR = jest.fn<any>();
const MOCK_GENERATE_KEY_PAIR_WITH_ID = jest.fn<any>();
const MOCK_SIGN_CERTIFICATE = jest.fn<any>();
const MOCK_CREATE_CSR = jest.fn<any>();
const MOCK_VALIDATE_CERTIFICATE = jest.fn<any>();
const MOCK_PARSE_KEY = jest.fn<any>();
const MOCK_SIGN = jest.fn<any>();

jest.mock("../src/lazy-pool", () => ({
	getPool: jest.fn(() => ({
		execute: MOCK_EXECUTE,
	})),
}));

const MOCK_REMOTE_SIGNING_CLIENT = {
	generateKeyPair: MOCK_GENERATE_KEY_PAIR,
	generateKeyPairWithId: MOCK_GENERATE_KEY_PAIR_WITH_ID,
	signCertificate: MOCK_SIGN_CERTIFICATE,
	createCsr: MOCK_CREATE_CSR,
	validateCertificate: MOCK_VALIDATE_CERTIFICATE,
	parseKey: MOCK_PARSE_KEY,
	sign: MOCK_SIGN,
};

jest.mock("../src/remote-signing-client", () => ({
	RemoteSigningClient: jest.fn(() => MOCK_REMOTE_SIGNING_CLIENT),
}));

import {
	createCsrAsync,
	generateKeyPairAsync,
	generateKeyPairWithIdAsync,
	parseKeyAsync,
	setRemoteSigningClient,
	signAsync,
	signCertificateAsync,
	validateCertificateAsync,
} from "../src/async";

describe("async module - pool path", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		setRemoteSigningClient(null);
	});

	it("generateKeyPairAsync should delegate to pool", async () => {
		MOCK_EXECUTE.mockResolvedValue({ publicKey: "pk", privateKey: "sk" });
		const result = await generateKeyPairAsync();
		expect(MOCK_EXECUTE).toHaveBeenCalledWith("generateKeyPair", {
			algorithm: "ec",
		});
		expect(result).toEqual({ publicKey: "pk", privateKey: "sk" });
	});

	it("generateKeyPairWithIdAsync should delegate to pool", async () => {
		MOCK_EXECUTE.mockResolvedValue({
			publicKey: "pk",
			privateKey: "sk",
			id: "id1",
		});
		const result = await generateKeyPairWithIdAsync();
		expect(MOCK_EXECUTE).toHaveBeenCalledWith("generateKeyPairWithId", {
			algorithm: "ec",
		});
		expect(result).toEqual({ publicKey: "pk", privateKey: "sk", id: "id1" });
	});

	it("signCertificateAsync should delegate to pool", async () => {
		MOCK_EXECUTE.mockResolvedValue({
			serialNumber: "SN-001",
			certPem: "cert",
			caPem: "ca",
			serviceId: "svc-1",
			issuedAt: new Date(),
			expiresAt: new Date(),
			fingerprint: "fp",
		});
		const result = await signCertificateAsync({} as any);
		expect(MOCK_EXECUTE).toHaveBeenCalledWith("signCertificate", {});
		expect(result.serialNumber).toBe("SN-001");
	});

	it("createCsrAsync should delegate to pool", async () => {
		MOCK_EXECUTE.mockResolvedValue("csr-pem");
		const result = await createCsrAsync({} as any);
		expect(MOCK_EXECUTE).toHaveBeenCalledWith("createCsr", {});
		expect(result).toBe("csr-pem");
	});

	it("validateCertificateAsync should delegate to pool", async () => {
		MOCK_EXECUTE.mockResolvedValue({ valid: true });
		const result = await validateCertificateAsync({ certPem: "cert" });
		expect(MOCK_EXECUTE).toHaveBeenCalledWith("validateCertificate", {
			certPem: "cert",
			caCertPem: undefined,
		});
		expect(result.valid).toBe(true);
	});

	it("validateCertificateAsync with caCertPem should delegate to pool", async () => {
		MOCK_EXECUTE.mockResolvedValue({ valid: true });
		const result = await validateCertificateAsync({
			certPem: "cert",
			caCertPem: "ca-cert",
		});
		expect(MOCK_EXECUTE).toHaveBeenCalledWith("validateCertificate", {
			certPem: "cert",
			caCertPem: "ca-cert",
		});
		expect(result.valid).toBe(true);
	});

	it("parseKeyAsync should delegate to pool", async () => {
		MOCK_EXECUTE.mockResolvedValue({ publicKey: "pk", privateKey: "sk" });
		const result = await parseKeyAsync("private-key");
		expect(MOCK_EXECUTE).toHaveBeenCalledWith("parseKey", {
			privateKey: "private-key",
		});
		expect(result).toEqual({ publicKey: "pk", privateKey: "sk" });
	});

	it("signAsync should delegate to pool", async () => {
		MOCK_EXECUTE.mockResolvedValue("signature");
		const result = await signAsync({
			algorithm: "sha256",
			body: "body",
			privateKey: "private-key",
		});
		expect(MOCK_EXECUTE).toHaveBeenCalledWith("sign", {
			algorithm: "sha256",
			body: "body",
			privateKey: "private-key",
		});
		expect(result).toBe("signature");
	});
});

describe("async module - remote client path", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		setRemoteSigningClient(MOCK_REMOTE_SIGNING_CLIENT as any);
	});

	it("generateKeyPairAsync should delegate to remote client", async () => {
		MOCK_GENERATE_KEY_PAIR.mockResolvedValue({
			publicKey: "pk",
			privateKey: "sk",
		});
		const result = await generateKeyPairAsync();
		expect(MOCK_GENERATE_KEY_PAIR).toHaveBeenCalledWith("ec");
		expect(result).toEqual({ publicKey: "pk", privateKey: "sk" });
	});

	it("generateKeyPairAsync with RSA should delegate to remote client", async () => {
		MOCK_GENERATE_KEY_PAIR.mockResolvedValue({
			publicKey: "pk",
			privateKey: "sk",
		});
		const result = await generateKeyPairAsync("rsa");
		expect(MOCK_GENERATE_KEY_PAIR).toHaveBeenCalledWith("rsa");
		expect(result).toEqual({ publicKey: "pk", privateKey: "sk" });
	});

	it("generateKeyPairWithIdAsync should delegate to remote client", async () => {
		MOCK_GENERATE_KEY_PAIR_WITH_ID.mockResolvedValue({
			publicKey: "pk",
			privateKey: "sk",
			id: "id1",
		});
		const result = await generateKeyPairWithIdAsync();
		expect(MOCK_GENERATE_KEY_PAIR_WITH_ID).toHaveBeenCalledWith("ec");
		expect(result).toEqual({ publicKey: "pk", privateKey: "sk", id: "id1" });
	});

	it("signCertificateAsync should delegate to remote client", async () => {
		MOCK_SIGN_CERTIFICATE.mockResolvedValue({
			serialNumber: "SN-001",
			certPem: "cert",
			caPem: "ca",
			serviceId: "svc-1",
			issuedAt: new Date(),
			expiresAt: new Date(),
			fingerprint: "fp",
		});
		const result = await signCertificateAsync({} as any);
		expect(MOCK_SIGN_CERTIFICATE).toHaveBeenCalledWith({});
		expect(result.serialNumber).toBe("SN-001");
	});

	it("createCsrAsync should delegate to remote client", async () => {
		MOCK_CREATE_CSR.mockResolvedValue("csr-pem");
		const result = await createCsrAsync({} as any);
		expect(MOCK_CREATE_CSR).toHaveBeenCalledWith({});
		expect(result).toBe("csr-pem");
	});

	it("validateCertificateAsync should delegate to remote client", async () => {
		MOCK_VALIDATE_CERTIFICATE.mockResolvedValue({ valid: true });
		const result = await validateCertificateAsync({ certPem: "cert" });
		expect(MOCK_VALIDATE_CERTIFICATE).toHaveBeenCalledWith("cert");
		expect(result.valid).toBe(true);
	});

	it("parseKeyAsync should delegate to remote client", async () => {
		MOCK_PARSE_KEY.mockResolvedValue({ publicKey: "pk", privateKey: "sk" });
		await parseKeyAsync("private-key");
		expect(MOCK_PARSE_KEY).toHaveBeenCalledWith("private-key");
	});

	it("signAsync should delegate to remote client", async () => {
		MOCK_SIGN.mockResolvedValue("signature");
		const result = await signAsync({
			algorithm: "sha256",
			body: "body",
			privateKey: "private-key",
		});
		expect(MOCK_SIGN).toHaveBeenCalledWith({
			algorithm: "sha256",
			body: "body",
			privateKey: "private-key",
		});
		expect(result).toBe("signature");
	});

	it("setRemoteSigningClient(null) should clear remote client", async () => {
		setRemoteSigningClient(null);
		MOCK_EXECUTE.mockResolvedValue({ publicKey: "pk", privateKey: "sk" });
		const result = await generateKeyPairAsync();
		expect(MOCK_EXECUTE).toHaveBeenCalled();
		expect(result).toEqual({ publicKey: "pk", privateKey: "sk" });
	});
});
