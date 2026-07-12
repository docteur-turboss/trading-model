import { createPublicKey, createVerify } from "node:crypto";
import { describe, expect, it } from "@jest/globals";
import { toSerialNumber } from "@trading-model/common/domain/primitives";
import { generateKeyPair, KeyAlgorithm } from "../src/keygen/generate-key-pair";
import { CertBodyBuilder } from "../src/validation/cert-body-builder";

describe("CertBodyBuilder", () => {
	it("should build a certificate body with all fields", () => {
		const builder = new CertBodyBuilder();
		const body = builder.build({
			serialNumber: toSerialNumber("SN-001"),
			now: new Date("2024-01-01"),
			expiresAt: new Date("2025-01-01"),
			publicKey: "pk-pem-content" as never,
			subject: "my-service",
			san: ["svc.example.com"],
			isCa: true,
		});

		expect(body).toContain("Serial: SN-001");
		expect(body).toContain("Subject: CN=my-service");
		expect(body).toContain("SAN: svc.example.com");
		expect(body).toContain("CA: TRUE");
		expect(body).toContain("Public Key: pk-pem-content");
	});

	it("should build body with default subject when not provided", () => {
		const builder = new CertBodyBuilder();
		const body = builder.build({
			serialNumber: toSerialNumber("SN-002"),
			now: new Date("2024-01-01"),
			expiresAt: new Date("2025-01-01"),
			publicKey: "pk-pem" as never,
		});

		expect(body).toContain("Subject: CN=TradingModelCA");
	});

	it("should build body without SAN when san is empty", () => {
		const builder = new CertBodyBuilder();
		const body = builder.build({
			serialNumber: toSerialNumber("SN-003"),
			now: new Date("2024-01-01"),
			expiresAt: new Date("2025-01-01"),
			publicKey: "pk-pem" as never,
			subject: "no-san-service",
			san: [],
		});

		expect(body).not.toContain("SAN:");
	});

	it("should build body without CA when isCa is false", () => {
		const builder = new CertBodyBuilder();
		const body = builder.build({
			serialNumber: toSerialNumber("SN-004"),
			now: new Date("2024-01-01"),
			expiresAt: new Date("2025-01-01"),
			publicKey: "pk-pem" as never,
			subject: "svc",
			isCa: false,
		});

		expect(body).not.toContain("CA: TRUE");
	});

	it("should sign a certificate body", () => {
		const keyPair = generateKeyPair(KeyAlgorithm.EcP384);
		const builder = new CertBodyBuilder();
		const body = builder.build({
			serialNumber: toSerialNumber("SN-005"),
			now: new Date("2024-01-01"),
			expiresAt: new Date("2025-01-01"),
			publicKey: keyPair.publicKey,
		});

		const signature = builder.signCertBody({
			certBody: body,
			privateKey: keyPair.privateKey,
		});

		expect(signature).toBeDefined();
		expect(typeof signature).toBe("string");
	});

	it("should build a certificate PEM with issuerCert", () => {
		const keyPair = generateKeyPair(KeyAlgorithm.EcP384);
		const builder = new CertBodyBuilder();
		const body = builder.build({
			serialNumber: toSerialNumber("SN-006"),
			now: new Date("2024-01-01"),
			expiresAt: new Date("2025-01-01"),
			publicKey: keyPair.publicKey,
			subject: "svc",
		});
		const signature = builder.signCertBody({
			certBody: body,
			privateKey: keyPair.privateKey,
		});

		const pem = builder.buildCertPem(body, signature, keyPair.publicKey);

		expect(pem).toContain("BEGIN CERTIFICATE");
		expect(pem).toContain("END CERTIFICATE");
		const decoded = JSON.parse(
			Buffer.from(
				pem
					.split("\n")
					.filter(
						(l) => !(l.startsWith("-----BEGIN") || l.startsWith("-----END"))
					)
					.join(""),
				"base64"
			).toString("utf8")
		);
		expect(decoded.body).toBe(body);
		expect(decoded.signature).toBe(signature);
		expect(decoded.issuerCert).toBe(keyPair.publicKey);
	});

	it("should build a certificate PEM without issuerCert", () => {
		const keyPair = generateKeyPair(KeyAlgorithm.EcP384);
		const builder = new CertBodyBuilder();
		const body = builder.build({
			serialNumber: toSerialNumber("SN-007"),
			now: new Date("2024-01-01"),
			expiresAt: new Date("2025-01-01"),
			publicKey: keyPair.publicKey,
		});
		const signature = builder.signCertBody({
			certBody: body,
			privateKey: keyPair.privateKey,
		});

		const pem = builder.buildCertPem(body, signature);

		const decoded = JSON.parse(
			Buffer.from(
				pem
					.split("\n")
					.filter(
						(l) => !(l.startsWith("-----BEGIN") || l.startsWith("-----END"))
					)
					.join(""),
				"base64"
			).toString("utf8")
		);
		expect(decoded.body).toBe(body);
		expect(decoded.signature).toBe(signature);
		expect(decoded.issuerCert).toBeUndefined();
	});

	it("should sign and build PEM in one step with issuerCert", () => {
		const keyPair = generateKeyPair(KeyAlgorithm.EcP384);
		const builder = new CertBodyBuilder();
		const body = builder.build({
			serialNumber: toSerialNumber("SN-008"),
			now: new Date("2024-01-01"),
			expiresAt: new Date("2025-01-01"),
			publicKey: keyPair.publicKey,
		});

		const pem = builder.signAndBuildPem({
			certBody: body,
			privateKey: keyPair.privateKey,
			issuerCert: keyPair.publicKey,
		});

		expect(pem).toContain("BEGIN CERTIFICATE");
		expect(pem).toContain("END CERTIFICATE");
	});

	it("should sign and build PEM without issuerCert", () => {
		const keyPair = generateKeyPair(KeyAlgorithm.EcP384);
		const builder = new CertBodyBuilder();
		const body = builder.build({
			serialNumber: toSerialNumber("SN-009"),
			now: new Date("2024-01-01"),
			expiresAt: new Date("2025-01-01"),
			publicKey: keyPair.publicKey,
		});

		const pem = builder.signAndBuildPem({
			certBody: body,
			privateKey: keyPair.privateKey,
		});

		expect(pem).toContain("BEGIN CERTIFICATE");
		expect(pem).toContain("END CERTIFICATE");
	});

	it("should produce a valid signature that passes crypto verification", () => {
		const keyPair = generateKeyPair(KeyAlgorithm.EcP384);
		const builder = new CertBodyBuilder();
		const body = builder.build({
			serialNumber: toSerialNumber("SN-010"),
			now: new Date("2024-01-01"),
			expiresAt: new Date("2025-01-01"),
			publicKey: keyPair.publicKey,
		});
		const signature = builder.signCertBody({
			certBody: body,
			privateKey: keyPair.privateKey,
		});

		const verify = createVerify("sha256");
		verify.update(body);
		const isValid = verify.verify(
			createPublicKey(keyPair.publicKey),
			signature,
			"base64"
		);

		expect(isValid).toBe(true);
	});
});
