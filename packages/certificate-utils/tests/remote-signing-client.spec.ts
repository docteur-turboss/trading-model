import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const MOCK_POST: any = jest.fn();
const MOCK_HTTP_CLIENT_INSTANCE = { post: MOCK_POST };

const MOCK_HTTP_CLIENT: any = jest.fn(() => MOCK_HTTP_CLIENT_INSTANCE);
MOCK_HTTP_CLIENT.createWithTls = jest.fn();

jest.mock("@trading-model/common/config/http-client", () => ({
	HttpClient: MOCK_HTTP_CLIENT,
}));

import { KeyAlgorithm } from "../src/generate-key-pair";
import { RemoteSigningClient } from "../src/signing/remote-signing-client";

function getClient(options: Record<string, any> = {}): RemoteSigningClient {
	return new RemoteSigningClient({
		baseUrl: "https://signer.example.com",
		...options,
	});
}

describe("RemoteSigningClient", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("should strip trailing slashes from baseUrl", () => {
		const c = getClient({ baseUrl: "https://signer.example.com///" });
		expect(c).toBeDefined();
	});

	it("should create with TLS config", () => {
		const c = getClient({
			tls: {
				caPath: "/ca.pem",
				certPath: "/cert.pem",
				keyPath: "/key.pem",
			},
		});
		expect(MOCK_HTTP_CLIENT.createWithTls).toHaveBeenCalledWith({
			caPath: "/ca.pem",
			certPath: "/cert.pem",
			keyPath: "/key.pem",
		});
		expect(MOCK_HTTP_CLIENT).not.toHaveBeenCalled();
		expect(c).toBeDefined();
	});

	describe("generateKeyPair", () => {
		it("should post to generate-key-pair endpoint", async () => {
			MOCK_POST.mockResolvedValue({ publicKey: "pk", privateKey: "sk" });
			const client = getClient();
			const result = await client.generateKeyPair(KeyAlgorithm.EcP384);

			expect(MOCK_POST).toHaveBeenCalledWith(
				"https://signer.example.com/api/v1/crypto/generate-key-pair",
				{ algorithm: "ec" },
				{ timeoutMs: 30000 }
			);
			expect(result).toEqual({ publicKey: "pk", privateKey: "sk" });
		});

		it("should throw on empty response", async () => {
			MOCK_POST.mockResolvedValue(null);
			const client = getClient();
			await expect(client.generateKeyPair()).rejects.toThrow(
				"Empty response from remote signer"
			);
		});
	});

	describe("generateKeyPairWithId", () => {
		it("should post to generate-key-pair-with-id endpoint", async () => {
			MOCK_POST.mockResolvedValue({
				publicKey: "pk",
				privateKey: "sk",
				id: "id1",
			});
			const client = getClient();
			const result = await client.generateKeyPairWithId(KeyAlgorithm.EcP384);

			expect(MOCK_POST).toHaveBeenCalledWith(
				"https://signer.example.com/api/v1/crypto/generate-key-pair-with-id",
				{ algorithm: "ec" },
				{ timeoutMs: 30000 }
			);
			expect(result).toEqual({ publicKey: "pk", privateKey: "sk", id: "id1" });
		});

		it("should throw on empty response", async () => {
			MOCK_POST.mockResolvedValue(null);
			const client = getClient();
			await expect(client.generateKeyPairWithId()).rejects.toThrow(
				"Empty response from remote signer"
			);
		});
	});

	describe("signCertificate", () => {
		it("should post to sign-certificate endpoint", async () => {
			const signed = {
				serialNumber: "SN",
				certPem: "cert",
				caPem: "ca",
				serviceId: "svc",
				issuedAt: new Date(),
				expiresAt: new Date(),
				fingerprint: "fp",
			};
			MOCK_POST.mockResolvedValue(signed);
			const client = getClient();
			const options = {
				csr: "csr",
				serviceId: "svc",
				caKeyPair: { publicKey: "pk", privateKey: "sk" } as any,
				caCertPem: "ca",
				ttlMs: 3600000,
			};

			const result = await client.signCertificate(options);

			expect(MOCK_POST).toHaveBeenCalledWith(
				"https://signer.example.com/api/v1/crypto/sign-certificate",
				options,
				{ timeoutMs: 30000 }
			);
			expect(result).toEqual(signed);
		});

		it("should throw on empty response", async () => {
			MOCK_POST.mockResolvedValue(null);
			const client = getClient();
			await expect(client.signCertificate({} as any)).rejects.toThrow(
				"Empty response from remote signer"
			);
		});
	});

	describe("createCsr", () => {
		it("should post to create-csr endpoint", async () => {
			MOCK_POST.mockResolvedValue("csr-pem");
			const client = getClient();
			const options = { commonName: "test", san: [], keyPem: "key" };

			const result = await client.createCsr(options);

			expect(MOCK_POST).toHaveBeenCalledWith(
				"https://signer.example.com/api/v1/crypto/create-csr",
				options,
				{ timeoutMs: 30000 }
			);
			expect(result).toBe("csr-pem");
		});

		it("should throw on undefined response", async () => {
			MOCK_POST.mockResolvedValue(undefined);
			const client = getClient();
			await expect(client.createCsr({} as any)).rejects.toThrow(
				"Empty response from remote signer"
			);
		});
	});

	describe("validateCertificate", () => {
		it("should post to validate-certificate endpoint", async () => {
			MOCK_POST.mockResolvedValue({ valid: true });
			const client = getClient();
			const result = await client.validateCertificate("cert-pem");

			expect(MOCK_POST).toHaveBeenCalledWith(
				"https://signer.example.com/api/v1/crypto/validate-certificate",
				{ certPem: "cert-pem" },
				{ timeoutMs: 30000 }
			);
			expect(result).toEqual({ valid: true });
		});

		it("should throw on empty response", async () => {
			MOCK_POST.mockResolvedValue(null);
			const client = getClient();
			await expect(client.validateCertificate("cert")).rejects.toThrow(
				"Empty response from remote signer"
			);
		});
	});

	describe("parseKey", () => {
		it("should post to parse-key endpoint", async () => {
			MOCK_POST.mockResolvedValue({ publicKey: "pk", privateKey: "sk" });
			const client = getClient();
			const result = await client.parseKey("private-key");

			expect(MOCK_POST).toHaveBeenCalledWith(
				"https://signer.example.com/api/v1/crypto/parse-key",
				{ privateKey: "private-key" },
				{ timeoutMs: 30000 }
			);
			expect(result).toEqual({ publicKey: "pk", privateKey: "sk" });
		});

		it("should throw on empty response", async () => {
			MOCK_POST.mockResolvedValue(null);
			const client = getClient();
			await expect(client.parseKey("key")).rejects.toThrow(
				"Empty response from remote signer"
			);
		});
	});

	describe("sign", () => {
		it("should post to sign endpoint", async () => {
			MOCK_POST.mockResolvedValue("signature");
			const client = getClient();
			const result = await client.sign({
				algorithm: "sha256",
				body: "body",
				privateKey: "private-key",
			});

			expect(MOCK_POST).toHaveBeenCalledWith(
				"https://signer.example.com/api/v1/crypto/sign",
				{ algorithm: "sha256", body: "body", privateKey: "private-key" },
				{ timeoutMs: 30000 }
			);
			expect(result).toBe("signature");
		});

		it("should throw on undefined response", async () => {
			MOCK_POST.mockResolvedValue(undefined);
			const client = getClient();
			await expect(
				client.sign({ algorithm: "sha256", body: "body", privateKey: "key" })
			).rejects.toThrow("Empty response from remote signer");
		});
	});
});
