import { describe, expect, it } from "@jest/globals";
import {
	generateKeyPair,
	generateKeyPairWithId,
	KeyAlgorithm,
} from "../src/keygen/generate-key-pair";

describe("generateKeyPair", () => {
	it("should generate an RSA 4096 key pair", () => {
		const keyPair = generateKeyPair(KeyAlgorithm.Rsa4096);

		expect(keyPair.publicKey).toBeDefined();
		expect(keyPair.privateKey).toBeDefined();
		expect(keyPair.publicKey).toContain("BEGIN PUBLIC KEY");
		expect(keyPair.privateKey).toContain("BEGIN PRIVATE KEY");
		expect(keyPair.publicKey).toContain("BEGIN PUBLIC KEY");
	});

	it("should generate an EC P-384 key pair", () => {
		const keyPair = generateKeyPair(KeyAlgorithm.EcP384);

		expect(keyPair.publicKey).toBeDefined();
		expect(keyPair.privateKey).toBeDefined();
		expect(keyPair.publicKey).toContain("BEGIN PUBLIC KEY");
		expect(keyPair.privateKey).toContain("BEGIN PRIVATE KEY");
	});

	it("should default to EC P-384", () => {
		const keyPair = generateKeyPair();

		expect(keyPair.publicKey).toBeDefined();
		expect(keyPair.privateKey).toBeDefined();
	});

	it("should return keys in PEM format", () => {
		const keyPair = generateKeyPair(KeyAlgorithm.EcP384);

		expect(keyPair.publicKey).toMatch(/^-----BEGIN PUBLIC KEY-----/);
		expect(keyPair.privateKey).toMatch(/^-----BEGIN PRIVATE KEY-----/);
		expect(keyPair.publicKey).toContain("-----END PUBLIC KEY-----");
		expect(keyPair.privateKey).toContain("-----END PRIVATE KEY-----");
	});

	it("should generate a unique key pair each time", () => {
		const kp1 = generateKeyPair(KeyAlgorithm.EcP384);
		const kp2 = generateKeyPair(KeyAlgorithm.EcP384);

		expect(kp1.privateKey).not.toBe(kp2.privateKey);
		expect(kp1.publicKey).not.toBe(kp2.publicKey);
	});

	it("generateKeyPairWithId should generate a key pair with an id", () => {
		const result = generateKeyPairWithId(KeyAlgorithm.EcP384);

		expect(result.publicKey).toBeDefined();
		expect(result.privateKey).toBeDefined();
		expect(result.id).toBeDefined();
		expect(typeof result.id).toBe("string");
	});

	it("generateKeyPairWithId should default to EC P-384", () => {
		const result = generateKeyPairWithId();

		expect(result.publicKey).toBeDefined();
		expect(result.privateKey).toBeDefined();
		expect(result.id).toBeDefined();
	});
});
