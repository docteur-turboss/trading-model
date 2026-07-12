import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { toFilePath, URLString } from "@trading-model/common/domain/primitives";

const MOCK_POST: any = jest.fn();

const MOCK_GET: any = jest.fn();

const MOCK_DELETE: any = jest.fn();
const MOCK_HTTP_CLIENT_INSTANCE = {
	post: MOCK_POST,
	get: MOCK_GET,
	delete: MOCK_DELETE,
};

const MOCK_HTTP_CLIENT: any = jest.fn(() => MOCK_HTTP_CLIENT_INSTANCE);
MOCK_HTTP_CLIENT.createWithTls = jest.fn();

jest.mock("@trading-model/common/config/http-client", () => ({
	HttpClient: MOCK_HTTP_CLIENT,
}));

jest.mock("@trading-model/common/config/logger", () => ({
	logger: {
		warn: jest.fn(),
	},
}));

jest.mock("@trading-model/common/utils/errors", () => ({
	normalizeError: jest.fn((err: unknown) =>
		err instanceof Error ? err : new Error(String(err))
	),
}));

import { VaultTransitClient } from "../src/vault/vault-transit-client";

function createClient(overrides: Record<string, any> = {}): VaultTransitClient {
	return new VaultTransitClient({
		vaultUrl: URLString.of("https://vault.example.com"),
		token: "s.test-token",
		...overrides,
	});
}

describe("VaultTransitClient", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("should strip trailing slashes from vaultUrl", () => {
		const client = createClient({
			vaultUrl: URLString.of("https://vault.example.com///"),
		});
		expect(client).toBeDefined();
	});

	it("should create with TLS config", () => {
		const client = new VaultTransitClient({
			vaultUrl: URLString.of("https://vault.example.com"),
			token: "s.test",
			tls: {
				caPath: toFilePath("/ca.pem"),
				certPath: toFilePath("/cert.pem"),
				keyPath: toFilePath("/key.pem"),
			},
		});
		expect(MOCK_HTTP_CLIENT.createWithTls).toHaveBeenCalledWith({
			caPath: toFilePath("/ca.pem"),
			certPath: toFilePath("/cert.pem"),
			keyPath: toFilePath("/key.pem"),
		});
		expect(client).toBeDefined();
	});

	it("should create with namespace", () => {
		const client = createClient({ namespace: "ns1" });
		expect(client).toBeDefined();
	});

	describe("createKey", () => {
		it("should post to create key endpoint with rsa type", async () => {
			MOCK_POST.mockResolvedValue(undefined);
			const client = createClient();

			await client.createKey("my-key", "rsa-4096");

			expect(MOCK_POST).toHaveBeenCalledWith(
				"https://vault.example.com/v1/transit/keys/my-key",
				{ type: "rsa-4096", exportable: false, allow_plaintext_backup: false },
				{ headers: { "X-Vault-Token": "s.test-token" }, timeoutMs: 30000 }
			);
		});

		it("should post to create key endpoint with ecdsa type", async () => {
			MOCK_POST.mockResolvedValue(undefined);
			const client = createClient();

			await client.createKey("my-key", "ecdsa-p384");

			expect(MOCK_POST).toHaveBeenCalledWith(
				"https://vault.example.com/v1/transit/keys/my-key",
				{
					type: "ecdsa-p384",
					exportable: false,
					allow_plaintext_backup: false,
				},
				{ headers: { "X-Vault-Token": "s.test-token" }, timeoutMs: 30000 }
			);
		});

		it("should include namespace header when configured", async () => {
			MOCK_POST.mockResolvedValue(undefined);
			const client = createClient({ namespace: "ns1" });

			await client.createKey("my-key", "ecdsa-p384");

			expect(MOCK_POST).toHaveBeenCalledWith(
				expect.any(String),
				expect.any(Object),
				{
					headers: {
						"X-Vault-Token": "s.test-token",
						"X-Vault-Namespace": "ns1",
					},
					timeoutMs: 30000,
				}
			);
		});
	});

	describe("sign", () => {
		it("should sign data and return signature", async () => {
			MOCK_POST.mockResolvedValue({
				data: { signature: "vault:v1:base64sig" },
			});
			const client = createClient();

			const result = await client.sign({
				keyName: "my-key",
				algorithm: "sha256",
				input: "input-data",
			});

			expect(MOCK_POST).toHaveBeenCalledWith(
				"https://vault.example.com/v1/transit/sign/my-key",
				{
					input: Buffer.from("input-data", "utf8").toString("base64"),
					hash_algorithm: "sha2-256",
				},
				{ headers: { "X-Vault-Token": "s.test-token" }, timeoutMs: 30000 }
			);
			expect(result).toBe("base64sig");
		});

		it("should handle signature without colon prefix", async () => {
			MOCK_POST.mockResolvedValue({ data: { signature: "base64sig" } });
			const client = createClient();

			const result = await client.sign({
				keyName: "my-key",
				algorithm: "sha384",
				input: "data",
			});

			expect(result).toBe("base64sig");
		});

		it("should throw on empty response", async () => {
			MOCK_POST.mockResolvedValue(null);
			const client = createClient();

			await expect(
				client.sign({ keyName: "my-key", algorithm: "sha256", input: "data" })
			).rejects.toThrow("Empty response from Vault Transit sign");
		});

		it("should map algorithm to vault hash algorithm", async () => {
			MOCK_POST.mockResolvedValue({ data: { signature: "vault:v1:sig" } });
			const client = createClient();

			await client.sign({
				keyName: "my-key",
				algorithm: "sha512",
				input: "data",
			});
			expect(MOCK_POST).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({ hash_algorithm: "sha2-512" }),
				expect.any(Object)
			);

			await client.sign({
				keyName: "my-key",
				algorithm: "sha1",
				input: "data",
			});
			expect(MOCK_POST).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({ hash_algorithm: "sha1" }),
				expect.any(Object)
			);

			await client.sign({
				keyName: "my-key",
				algorithm: "unknown",
				input: "data",
			});
			expect(MOCK_POST).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({ hash_algorithm: "sha2-256" }),
				expect.any(Object)
			);
		});
	});

	describe("signBytes", () => {
		it("should sign DER bytes and return binary signature", async () => {
			MOCK_POST.mockResolvedValue({ data: { signature: "vault:v1:AAECAw==" } });
			const client = createClient();

			const result = await client.signBytes("my-key", "\x00\x01\x02\x03");

			expect(MOCK_POST).toHaveBeenCalledWith(
				"https://vault.example.com/v1/transit/sign/my-key",
				{ input: "AAECAw==", hash_algorithm: "sha2-256" },
				{ headers: { "X-Vault-Token": "s.test-token" }, timeoutMs: 30000 }
			);
			expect(result).toBe("\x00\x01\x02\x03");
		});

		it("should handle signature without colon prefix", async () => {
			MOCK_POST.mockResolvedValue({ data: { signature: "AAECAw==" } });
			const client = createClient();

			const result = await client.signBytes("my-key", "\x00\x01\x02\x03");

			expect(result).toBe("\x00\x01\x02\x03");
		});

		it("should throw on empty response", async () => {
			MOCK_POST.mockResolvedValue(null);
			const client = createClient();

			await expect(client.signBytes("my-key", "der")).rejects.toThrow(
				"Empty response from Vault Transit sign"
			);
		});
	});

	describe("readPublicKey", () => {
		it("should read public key from vault", async () => {
			MOCK_GET.mockResolvedValue({
				data: { keys: { "1": "public-key-pem", "2": "public-key-pem-v2" } },
			});
			const client = createClient();

			const result = await client.readPublicKey("my-key");

			expect(MOCK_GET).toHaveBeenCalledWith(
				"https://vault.example.com/v1/transit/keys/my-key",
				{
					headers: { "X-Vault-Token": "s.test-token" },
					timeoutMs: 30000,
				}
			);
			expect(result).toBe("public-key-pem-v2");
		});

		it("should throw when key is not found", async () => {
			MOCK_GET.mockResolvedValue(null);
			const client = createClient();

			await expect(client.readPublicKey("my-key")).rejects.toThrow(
				"not found in Vault Transit"
			);
		});

		it("should throw when key has no versions", async () => {
			MOCK_GET.mockResolvedValue({ data: { keys: {} } });
			const client = createClient();

			await expect(client.readPublicKey("my-key")).rejects.toThrow(
				"has no versions"
			);
		});
	});

	describe("keyExists", () => {
		it("should return true when key exists", async () => {
			MOCK_GET.mockResolvedValue({ data: { keys: { "1": "pk" } } });
			const client = createClient();

			const result = await client.keyExists("my-key");

			expect(result).toBe(true);
		});

		it("should return false when key does not exist", async () => {
			const err = new Error("Not found");
			MOCK_GET.mockRejectedValue(err);
			const client = createClient();

			const result = await client.keyExists("my-key");

			expect(result).toBe(false);
		});
	});

	describe("deleteKey", () => {
		it("should delete key from vault", async () => {
			MOCK_DELETE.mockResolvedValue(undefined);
			const client = createClient();

			await client.deleteKey("my-key");

			expect(MOCK_DELETE).toHaveBeenCalledWith(
				"https://vault.example.com/v1/transit/keys/my-key",
				undefined,
				{ headers: { "X-Vault-Token": "s.test-token" }, timeoutMs: 30000 }
			);
		});

		it("should encode key name in URL", async () => {
			MOCK_DELETE.mockResolvedValue(undefined);
			const client = createClient();

			await client.deleteKey("my/key/name");

			expect(MOCK_DELETE).toHaveBeenCalledWith(
				"https://vault.example.com/v1/transit/keys/my%2Fkey%2Fname",
				undefined,
				expect.any(Object)
			);
		});
	});
});
