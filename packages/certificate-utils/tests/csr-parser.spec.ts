import { describe, expect, it } from "@jest/globals";
import forge from "node-forge";
import type { CsrSubject } from "../src/signing/create-csr";
import { CsrParser, SanEntryType } from "../src/validation/csr-parser";

function createRealCsrPem(subject: CsrSubject): string {
	const keys = forge.pki.rsa.generateKeyPair(2048);
	const csr = forge.pki.createCertificationRequest();
	csr.publicKey = keys.publicKey;
	csr.subject.addField({ name: "commonName", value: subject.commonName });
	if (subject.san.length > 0) {
		csr.setAttributes([
			{
				name: "extensionRequest",
				extensions: [
					{
						name: "subjectAltName",
						altNames: subject.san.map((dns) => ({
							type: 2,
							value: dns,
						})),
					},
				],
			},
		]);
	}
	csr.sign(keys.privateKey, forge.md.sha256.create());
	return forge.pki.certificationRequestToPem(csr);
}

describe("SanEntryType", () => {
	it("should create DNS from number", () => {
		const type = SanEntryType.fromNumber(2);
		expect(type.toNumber()).toBe(2);
	});

	it("should create from any number", () => {
		const type = SanEntryType.fromNumber(5);
		expect(type.toNumber()).toBe(5);
	});

	it("should match DNS type correctly", () => {
		expect(SanEntryType.matches(2, SanEntryType.DNS)).toBe(true);
		expect(SanEntryType.matches(1, SanEntryType.DNS)).toBe(false);
	});

	it("should implement equals", () => {
		const dns = SanEntryType.fromNumber(2);
		expect(dns.equals(SanEntryType.DNS)).toBe(true);
		expect(SanEntryType.fromNumber(1).equals(SanEntryType.DNS)).toBe(false);
	});
});

describe("CsrParser", () => {
	it("should parse CSR with SAN entries", () => {
		const pem = createRealCsrPem({
			commonName: "test-service",
			san: ["test.example.com"],
		});
		const parser = new CsrParser();
		const result = parser.parse(pem);

		expect(result.commonName).toBe("test-service");
		expect(result.san).toEqual(["test.example.com"]);
		expect(result.publicKeyPem).toContain("BEGIN PUBLIC KEY");
	});

	it("should parse CSR with multiple SAN entries", () => {
		const pem = createRealCsrPem({
			commonName: "multi-san",
			san: ["a.example.com", "b.example.com"],
		});
		const parser = new CsrParser();
		const result = parser.parse(pem);

		expect(result.san).toEqual(["a.example.com", "b.example.com"]);
	});

	it("should return empty SAN when CSR has no extension request", () => {
		const keys = forge.pki.rsa.generateKeyPair(2048);
		const csr = forge.pki.createCertificationRequest();
		csr.publicKey = keys.publicKey;
		csr.subject.addField({ name: "commonName", value: "no-ext" });
		csr.sign(keys.privateKey, forge.md.sha256.create());
		const pem = forge.pki.certificationRequestToPem(csr);
		const parser = new CsrParser();
		const result = parser.parse(pem);

		expect(result.san).toEqual([]);
	});

	it("should return empty SAN when SAN extension has no altNames", () => {
		const keys = forge.pki.rsa.generateKeyPair(2048);
		const csr = forge.pki.createCertificationRequest();
		csr.publicKey = keys.publicKey;
		csr.subject.addField({ name: "commonName", value: "no-altnames" });
		csr.setAttributes([
			{
				name: "extensionRequest",
				extensions: [
					{
						name: "subjectAltName",
						altNames: [],
					},
				],
			},
		]);
		csr.sign(keys.privateKey, forge.md.sha256.create());
		const pem = forge.pki.certificationRequestToPem(csr);
		const parser = new CsrParser();
		const result = parser.parse(pem);

		expect(result.san).toEqual([]);
	});

	it("should return empty common name when CN field is missing", () => {
		const keys = forge.pki.rsa.generateKeyPair(2048);
		const csr = forge.pki.createCertificationRequest();
		csr.publicKey = keys.publicKey;
		csr.sign(keys.privateKey, forge.md.sha256.create());
		const pem = forge.pki.certificationRequestToPem(csr);
		const parser = new CsrParser();
		const result = parser.parse(pem);

		expect(result.commonName).toBe("");
	});
});
