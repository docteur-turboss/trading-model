import { describe, expect, it } from "@jest/globals";
import { parseKey, sign } from "../src/format/sign";
import { generateKeyPair, KeyAlgorithm } from "../src/keygen/generate-key-pair";

describe("parseKey", () => {
	it("should extract public key from EC private key", () => {
		const kp = generateKeyPair(KeyAlgorithm.EcP384);
		const result = parseKey(kp.privateKey);
		expect(result.publicKey).toContain("BEGIN PUBLIC KEY");
		expect(result.privateKey).toBe(kp.privateKey);
	});

	it("should extract public key from RSA private key", () => {
		const kp = generateKeyPair(KeyAlgorithm.Rsa4096);
		const result = parseKey(kp.privateKey);
		expect(result.publicKey).toContain("BEGIN PUBLIC KEY");
		expect(result.privateKey).toBe(kp.privateKey);
	});
});

describe("sign", () => {
	it("should sign data with EC private key", () => {
		const kp = generateKeyPair(KeyAlgorithm.EcP384);
		const signature = sign({
			algorithm: "sha256",
			body: "test body",
			privateKey: kp.privateKey,
		});
		expect(signature).toBeDefined();
		expect(typeof signature).toBe("string");
		expect(signature.length).toBeGreaterThan(0);
	});

	it("should sign data with RSA private key", () => {
		const kp = generateKeyPair(KeyAlgorithm.Rsa4096);
		const signature = sign({
			algorithm: "sha256",
			body: "test body",
			privateKey: kp.privateKey,
		});
		expect(signature).toBeDefined();
		expect(typeof signature).toBe("string");
		expect(signature.length).toBeGreaterThan(0);
	});

	it("should produce different signatures for different inputs", () => {
		const kp = generateKeyPair(KeyAlgorithm.EcP384);
		const sig1 = sign({
			algorithm: "sha256",
			body: "body1",
			privateKey: kp.privateKey,
		});
		const sig2 = sign({
			algorithm: "sha256",
			body: "body2",
			privateKey: kp.privateKey,
		});
		expect(sig1).not.toBe(sig2);
	});
});
