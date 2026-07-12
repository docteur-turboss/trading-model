import { createSign } from "node:crypto";
import { describe, expect, it } from "@jest/globals";
import { toSerialNumber } from "@trading-model/common/domain/primitives";
import { generateKeyPair, KeyAlgorithm } from "../src/keygen/generate-key-pair";
import { CertBodyBuilder } from "../src/validation/cert-body-builder";
import { validateCertificate } from "../src/validation/validate-certificate";

function createValidCertPem(ttlMs = 3600000): {
	certPem: string;
	caCertPem: string;
} {
	const caKeyPair = generateKeyPair(KeyAlgorithm.EcP384);
	const builder = new CertBodyBuilder();
	const now = new Date();
	const expiresAt = new Date(now.getTime() + ttlMs);
	const body = builder.build({
		serialNumber: toSerialNumber("SN-TEST"),
		now,
		expiresAt,
		publicKey: caKeyPair.publicKey,
		subject: "test-service",
		san: ["test.internal"],
	});
	const signature = builder.signCertBody({
		certBody: body,
		privateKey: caKeyPair.privateKey,
	});
	const certPem = builder.buildCertPem(body, signature, caKeyPair.publicKey);
	return { certPem, caCertPem: caKeyPair.publicKey };
}

describe("validateCertificate (validation path)", () => {
	it("should return valid for a properly signed certificate", () => {
		const { certPem, caCertPem } = createValidCertPem();

		const result = validateCertificate({ certPem, caCertPem });

		expect(result.valid).toBe(true);
		expect(result.reason).toBeUndefined();
	});

	it("should return invalid for tampered certificate", () => {
		const { certPem, caCertPem } = createValidCertPem();
		const lines = certPem
			.split("\n")
			.filter((l) => !(l.startsWith("-----BEGIN") || l.startsWith("-----END")));
		const decoded = JSON.parse(
			Buffer.from(lines.join(""), "base64").toString("utf8")
		);
		decoded.body += " TAMPERED";
		const reEncoded = Buffer.from(JSON.stringify(decoded)).toString("base64");
		const tamperedCertPem = `-----BEGIN CERTIFICATE-----\n${reEncoded}\n-----END CERTIFICATE-----`;

		const result = validateCertificate({
			certPem: tamperedCertPem,
			caCertPem,
		});

		expect(result.valid).toBe(false);
		expect(result.reason).toBe("Signature verification failed");
	});

	it("should return invalid for expired certificate", () => {
		const caKeyPair = generateKeyPair(KeyAlgorithm.EcP384);
		const builder = new CertBodyBuilder();
		const body = builder.build({
			serialNumber: toSerialNumber("SN-EXP"),
			now: new Date("2020-01-01"),
			expiresAt: new Date("2021-01-01"),
			publicKey: caKeyPair.publicKey,
			subject: "expired-service",
		});
		const sign = createSign("sha256");
		sign.update(body);
		const signature = sign.sign(caKeyPair.privateKey, "base64");
		const pem = builder.buildCertPem(body, signature, caKeyPair.publicKey);

		const result = validateCertificate({
			certPem: pem,
			caCertPem: caKeyPair.publicKey,
		});

		expect(result.valid).toBe(false);
		expect(result.reason).toBe("Certificate expired");
	});

	it("should return invalid for not-yet-valid certificate", () => {
		const caKeyPair = generateKeyPair(KeyAlgorithm.EcP384);
		const builder = new CertBodyBuilder();
		const futureYear = (new Date().getFullYear() + 10).toString();
		const body = builder.build({
			serialNumber: toSerialNumber("SN-FUT"),
			now: new Date(`${futureYear}-01-01`),
			expiresAt: new Date(`${Number(futureYear) + 1}-01-01`),
			publicKey: caKeyPair.publicKey,
			subject: "future-service",
		});
		const sign = createSign("sha256");
		sign.update(body);
		const signature = sign.sign(caKeyPair.privateKey, "base64");
		const pem = builder.buildCertPem(body, signature, caKeyPair.publicKey);

		const result = validateCertificate({
			certPem: pem,
			caCertPem: caKeyPair.publicKey,
		});

		expect(result.valid).toBe(false);
		expect(result.reason).toBe("Certificate not yet valid");
	});

	it("should return invalid for wrong CA signature", () => {
		const caKeyPair = generateKeyPair(KeyAlgorithm.EcP384);
		const wrongCa = generateKeyPair(KeyAlgorithm.Rsa4096);
		const builder = new CertBodyBuilder();
		const now = new Date();
		const expiresAt = new Date(now.getTime() + 3600000);
		const body = builder.build({
			serialNumber: toSerialNumber("SN-WRONG"),
			now,
			expiresAt,
			publicKey: caKeyPair.publicKey,
			subject: "wrong-ca",
		});
		const sign = createSign("sha256");
		sign.update(body);
		const signature = sign.sign(wrongCa.privateKey, "base64");
		const pem = builder.buildCertPem(body, signature, caKeyPair.publicKey);

		const result = validateCertificate({
			certPem: pem,
			caCertPem: caKeyPair.publicKey,
		});

		expect(result.valid).toBe(false);
		expect(result.reason).toBe("Signature verification failed");
	});

	it("should return validation error for malformed PEM", () => {
		const result = validateCertificate({
			certPem: "not-a-pem",
			caCertPem: "",
		});

		expect(result.valid).toBe(false);
		expect(result.reason).toContain("Validation error:");
	});

	it("should return validation error for empty PEM", () => {
		const result = validateCertificate({ certPem: "", caCertPem: "" });

		expect(result.valid).toBe(false);
		expect(result.reason).toContain("Validation error:");
	});
});
