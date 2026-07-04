import { describe, expect, it } from "@jest/globals";
import { generateKeyPair, KeyAlgorithm } from "../src/generate-key-pair";
import { parseKey, sign } from "../src/sign";

describe("parseKey", () => {
	it("should extract public key from EC private key", () => {
		const kp = generateKeyPair(KeyAlgorithm.ecP384);
		const result = parseKey(kp.privateKey);
		expect(result.publicKey).toContain("BEGIN PUBLIC KEY");
		expect(result.privateKey).toBe(kp.privateKey);
	});

	it("should extract public key from RSA private key", () => {
		const kp = generateKeyPair(KeyAlgorithm.rsa4096);
		const result = parseKey(kp.privateKey);
		expect(result.publicKey).toContain("BEGIN PUBLIC KEY");
		expect(result.privateKey).toBe(kp.privateKey);
	});
});

describe("sign", () => {
	it("should sign data with EC private key", () => {
		const kp = generateKeyPair(KeyAlgorithm.ecP384);
		const signature = sign("sha256", "test body", kp.privateKey);
		expect(signature).toBeDefined();
		expect(typeof signature).toBe("string");
		expect(signature.length).toBeGreaterThan(0);
	});

	it("should sign data with RSA private key", () => {
		const kp = generateKeyPair(KeyAlgorithm.rsa4096);
		const signature = sign("sha256", "test body", kp.privateKey);
		expect(signature).toBeDefined();
		expect(typeof signature).toBe("string");
		expect(signature.length).toBeGreaterThan(0);
	});

	it("should produce different signatures for different inputs", () => {
		const kp = generateKeyPair(KeyAlgorithm.ecP384);
		const sig1 = sign("sha256", "body1", kp.privateKey);
		const sig2 = sign("sha256", "body2", kp.privateKey);
		expect(sig1).not.toBe(sig2);
	});
});
