import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "@jest/globals";
import forge from "node-forge";

import { signCertWithCaKey } from "../../src/core/ca-signer";

describe("ca-signer", () => {
	it("should sign a certificate with RSA key", () => {
		const cert = forge.pki.createCertificate();
		cert.serialNumber = "01";
		cert.validity.notBefore = new Date();
		cert.validity.notAfter = new Date();
		cert.validity.notAfter.setFullYear(
			cert.validity.notBefore.getFullYear() + 1
		);
		const attrs = [{ name: "commonName", value: "test" }];
		cert.setSubject(attrs);
		cert.setIssuer(attrs);

		const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
		const pubPem = keys.publicKey.export({
			type: "spki",
			format: "pem",
		}) as string;
		cert.publicKey = forge.pki.publicKeyFromPem(pubPem);

		const privPem = keys.privateKey.export({
			type: "pkcs1",
			format: "pem",
		}) as string;
		let getterCalled = false;
		const getCaKey = () => {
			getterCalled = true;
			return privPem;
		};

		signCertWithCaKey(cert, getCaKey);

		expect(getterCalled).toBe(true);
		expect(cert.signature).toBeDefined();
		expect(typeof cert.signature).toBe("string");
		expect(cert.signature.length).toBeGreaterThan(0);
	});
});
