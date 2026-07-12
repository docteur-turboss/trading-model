import { describe, expect, it } from "@jest/globals";
import { generateKeyPair, KeyAlgorithm } from "../src/keygen/generate-key-pair";
import { createCsr } from "../src/signing/create-csr";

describe("createCsr", () => {
	it("should create a CSR in PEM format", () => {
		const keyPair = generateKeyPair(KeyAlgorithm.EcP384);
		const csr = createCsr({
			commonName: "test-service",
			san: ["test-service.internal"],
			keyPem: keyPair.privateKey,
		});

		expect(csr).toContain("BEGIN CERTIFICATE REQUEST");
		expect(csr).toContain("END CERTIFICATE REQUEST");
	});

	it("should include the common name in the CSR body", () => {
		const keyPair = generateKeyPair(KeyAlgorithm.EcP384);
		const csr = createCsr({
			commonName: "my-service",
			san: ["my-service.internal"],
			keyPem: keyPair.privateKey,
		});

		const decoded = decodeCsr(csr);
		expect(decoded.commonName).toBe("my-service");
	});

	it("should include SAN entries in the CSR body", () => {
		const keyPair = generateKeyPair(KeyAlgorithm.EcP384);
		const csr = createCsr({
			commonName: "multi-san",
			san: ["san1.example.com", "san2.example.com", "10.0.0.1"],
			keyPem: keyPair.privateKey,
		});

		const decoded = decodeCsr(csr);
		expect(decoded.san).toEqual([
			"san1.example.com",
			"san2.example.com",
			"10.0.0.1",
		]);
	});

	it("should include the public key in PEM format", () => {
		const keyPair = generateKeyPair(KeyAlgorithm.EcP384);
		const csr = createCsr({
			commonName: "key-test",
			san: ["key-test.internal"],
			keyPem: keyPair.privateKey,
		});

		const decoded = decodeCsr(csr);
		expect(decoded.publicKey).toContain("BEGIN PUBLIC KEY");
	});

	it("should include a base64 signature", () => {
		const keyPair = generateKeyPair(KeyAlgorithm.EcP384);
		const csr = createCsr({
			commonName: "sig-test",
			san: ["sig-test.internal"],
			keyPem: keyPair.privateKey,
		});

		const decoded = decodeCsr(csr);
		expect(decoded.signature).toBeDefined();
		expect(typeof decoded.signature).toBe("string");
		expect(decoded.signature.length).toBeGreaterThan(0);
	});

	it("should create a CSR with RSA key pair", () => {
		const keyPair = generateKeyPair(KeyAlgorithm.Rsa4096);
		const csr = createCsr({
			commonName: "rsa-service",
			san: ["rsa-service.internal"],
			keyPem: keyPair.privateKey,
		});

		expect(csr).toContain("BEGIN CERTIFICATE REQUEST");
		const decoded = decodeCsr(csr);
		expect(decoded.commonName).toBe("rsa-service");
	});

	it("should handle a single SAN entry", () => {
		const keyPair = generateKeyPair(KeyAlgorithm.EcP384);
		const csr = createCsr({
			commonName: "single-san",
			san: ["single.example.com"],
			keyPem: keyPair.privateKey,
		});

		const decoded = decodeCsr(csr);
		expect(decoded.san).toEqual(["single.example.com"]);
	});

	it("should handle empty SAN array", () => {
		const keyPair = generateKeyPair(KeyAlgorithm.EcP384);
		const csr = createCsr({
			commonName: "no-san",
			san: [],
			keyPem: keyPair.privateKey,
		});

		const decoded = decodeCsr(csr);
		expect(decoded.san).toEqual([]);
	});
});

function decodeCsr(csr: string): {
	commonName: string;
	san: string[];
	publicKey: string;
	signature: string;
} {
	const lines = csr
		.split("\n")
		.filter((l) => !(l.startsWith("-----BEGIN") || l.startsWith("-----END")));
	const body = Buffer.from(lines.join(""), "base64").toString("utf8");
	return JSON.parse(body);
}
