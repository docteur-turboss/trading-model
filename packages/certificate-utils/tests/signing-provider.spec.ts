import { describe, expect, it } from "@jest/globals";
import { generateKeyPair, KeyAlgorithm } from "../src/keygen/generate-key-pair";
import { LocalSigningProvider } from "../src/signing/signing-provider";

describe("LocalSigningProvider", () => {
	it("should return the public key", async () => {
		const keyPair = generateKeyPair(KeyAlgorithm.EcP384);
		const provider = new LocalSigningProvider(keyPair);

		const publicKey = await provider.getPublicKey();

		expect(publicKey).toBe(keyPair.publicKey);
	});

	it("should sign data with EC key", async () => {
		const keyPair = generateKeyPair(KeyAlgorithm.EcP384);
		const provider = new LocalSigningProvider(keyPair);

		const data = Buffer.from("test data");
		const signature = await provider.sign(data);

		expect(signature).toBeInstanceOf(Buffer);
		expect(signature.length).toBeGreaterThan(0);
	});

	it("should sign data with RSA key", async () => {
		const keyPair = generateKeyPair(KeyAlgorithm.Rsa4096);
		const provider = new LocalSigningProvider(keyPair);

		const data = Buffer.from("test data");
		const signature = await provider.sign(data);

		expect(signature).toBeInstanceOf(Buffer);
		expect(signature.length).toBeGreaterThan(0);
	});

	it("should return isRemote as false", () => {
		const keyPair = generateKeyPair(KeyAlgorithm.EcP384);
		const provider = new LocalSigningProvider(keyPair);

		expect(provider.isRemote()).toBe(false);
	});

	it("should not throw on destroy", () => {
		const keyPair = generateKeyPair(KeyAlgorithm.EcP384);
		const provider = new LocalSigningProvider(keyPair);

		expect(() => provider.destroy()).not.toThrow();
	});
});
