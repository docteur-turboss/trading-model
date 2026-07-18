import { describe, expect, it } from "@jest/globals";
import {
	toCsrPem,
	toServiceId,
	UnixTimestamp,
} from "@trading-model/common/domain/primitives";
import { generateKeyPair, KeyAlgorithm } from "../src/keygen/generate-key-pair";
import { createCsr } from "../src/signing/create-csr";
import { signCertificate } from "../src/signing/sign-certificate";

describe("signCertificate", () => {
	it("should sign a CSR and return a SignedCertificate", () => {
		const caKeyPair = generateKeyPair(KeyAlgorithm.Rsa4096);
		const caCertPem = caKeyPair.publicKey as never;
		const serviceKeyPair = generateKeyPair(KeyAlgorithm.EcP384);
		const csr = createCsr({
			commonName: "test-service",
			san: ["test-service.internal"],
			keyPem: serviceKeyPair.privateKey,
		});

		const result = signCertificate({
			csr: toCsrPem(csr),
			serviceId: toServiceId("svc-123"),
			ca: { caKeyPair, caCertPem },
			ttlMs: 3600000 as never,
		});

		expect(result.serialNumber).toBeDefined();
		expect(result.serialNumber.length).toBe(16);
		expect(result.certPem).toContain("BEGIN CERTIFICATE");
		expect(result.certPem).toContain("END CERTIFICATE");
		expect(result.caPem).toBe(caCertPem);
		expect(result.serviceId).toBe("svc-123");
		expect(result.fingerprint).toBeDefined();
		expect(result.fingerprint.length).toBe(64);
	});

	it("should set correct validity period", () => {
		const caKeyPair = generateKeyPair(KeyAlgorithm.Rsa4096);
		const caCertPem = caKeyPair.publicKey as never;
		const serviceKeyPair = generateKeyPair(KeyAlgorithm.EcP384);
		const csr = createCsr({
			commonName: "validity-test",
			san: ["validity.internal"],
			keyPem: serviceKeyPair.privateKey,
		});

		const ttlMs = 7200000 as never;
		const before = Date.now();
		const result = signCertificate({
			csr: toCsrPem(csr),
			serviceId: toServiceId("svc-456"),
			ca: { caKeyPair, caCertPem },
			ttlMs,
		});
		const after = Date.now();

		expect(
			UnixTimestamp.toDate(result.issuedAt).getTime()
		).toBeGreaterThanOrEqual(before);
		expect(UnixTimestamp.toDate(result.issuedAt).getTime()).toBeLessThanOrEqual(
			after
		);
		expect(
			UnixTimestamp.toDate(result.expiresAt).getTime() -
				UnixTimestamp.toDate(result.issuedAt).getTime()
		).toBe(ttlMs);
	});

	it("should produce unique serial numbers for different certs", () => {
		const caKeyPair = generateKeyPair(KeyAlgorithm.Rsa4096);
		const caCertPem = caKeyPair.publicKey as never;
		const serviceKeyPair = generateKeyPair(KeyAlgorithm.EcP384);
		const csr = createCsr({
			commonName: "unique-serial",
			san: ["unique.internal"],
			keyPem: serviceKeyPair.privateKey,
		});

		const r1 = signCertificate({
			csr: toCsrPem(csr),
			serviceId: toServiceId("svc-1"),
			ca: { caKeyPair, caCertPem },
			ttlMs: 3600000 as never,
		});
		const r2 = signCertificate({
			csr: toCsrPem(csr),
			serviceId: toServiceId("svc-2"),
			ca: { caKeyPair, caCertPem },
			ttlMs: 3600000 as never,
		});

		expect(r1.serialNumber).not.toBe(r2.serialNumber);
		expect(r1.fingerprint).not.toBe(r2.fingerprint);
	});

	it("should sign with RSA CA key and EC service key", () => {
		const caKeyPair = generateKeyPair(KeyAlgorithm.EcP384);
		const caCertPem = caKeyPair.publicKey as never;
		const serviceKeyPair = generateKeyPair(KeyAlgorithm.Rsa4096);
		const csr = createCsr({
			commonName: "mixed-algo",
			san: ["mixed.internal"],
			keyPem: serviceKeyPair.privateKey,
		});

		const result = signCertificate({
			csr: toCsrPem(csr),
			serviceId: toServiceId("svc-mixed"),
			ca: { caKeyPair, caCertPem },
			ttlMs: 60000 as never,
		});

		expect(result.certPem).toContain("BEGIN CERTIFICATE");
		expect(result.fingerprint).toBeDefined();
	});
});
