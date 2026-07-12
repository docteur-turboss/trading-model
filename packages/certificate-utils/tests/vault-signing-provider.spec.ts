import { describe, expect, it, jest } from "@jest/globals";
import { VaultSigningProvider } from "../src/signing/vault-signing-provider";
import type { VaultTransitClient } from "../src/signing/vault-transit-client";

function createMockVault(): jest.Mocked<VaultTransitClient> {
	return {
		readPublicKey: jest.fn(),
		signBytes: jest.fn(),
		destroy: jest.fn(),
		createKey: jest.fn(),
		sign: jest.fn(),
		keyExists: jest.fn(),
		deleteKey: jest.fn(),
	} as unknown as jest.Mocked<VaultTransitClient>;
}

describe("VaultSigningProvider", () => {
	it("should return the public key", async () => {
		const vault = createMockVault();
		const provider = new VaultSigningProvider(
			vault,
			"test-key",
			"public-key-pem-content"
		);

		const publicKey = await provider.getPublicKey();

		expect(publicKey).toBe("public-key-pem-content");
	});

	it("should return isRemote as true", () => {
		const vault = createMockVault();
		const provider = new VaultSigningProvider(vault, "test-key", "pk");

		expect(provider.isRemote()).toBe(true);
	});

	it("should delegate sign to vault signBytes", async () => {
		const vault = createMockVault();
		vault.signBytes.mockResolvedValue("signed-binary");
		const provider = new VaultSigningProvider(vault, "test-key", "pk");

		const input = Buffer.from("tbs-der-bytes", "binary");
		const signature = await provider.sign(input);

		expect(vault.signBytes).toHaveBeenCalledWith("test-key", "tbs-der-bytes");
		expect(signature).toEqual(Buffer.from("signed-binary", "binary"));
	});

	it("should destroy vault client on destroy", () => {
		const vault = createMockVault();
		const provider = new VaultSigningProvider(vault, "test-key", "pk");

		provider.destroy();

		expect(vault.destroy).toHaveBeenCalled();
	});

	it("should create instance via static factory", async () => {
		const vault = createMockVault();
		vault.readPublicKey.mockResolvedValue("pk-from-vault");

		const provider = await VaultSigningProvider.create(vault, "my-key");

		expect(vault.readPublicKey).toHaveBeenCalledWith("my-key");
		expect(provider).toBeInstanceOf(VaultSigningProvider);
		const publicKey = await provider.getPublicKey();
		expect(publicKey).toBe("pk-from-vault");
	});
});
