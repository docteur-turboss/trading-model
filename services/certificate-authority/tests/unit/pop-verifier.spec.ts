import { describe, expect, it } from "@jest/globals";

import { PopVerifier } from "../../src/domain/pop-verifier";

describe("PopVerifier", () => {
	it("should return false for invalid certificate PEM", () => {
		const verifier = new PopVerifier();
		expect(
			verifier.verify({
				certPem: "invalid-pem",
				nonce: "nonce",
				signature: "signature",
			})
		).toBe(false);
	});

	it("should return false for empty signature", () => {
		const verifier = new PopVerifier();
		expect(
			verifier.verify({ certPem: "invalid-pem", nonce: "nonce", signature: "" })
		).toBe(false);
	});

	it("should return false for invalid base64 signature", () => {
		const verifier = new PopVerifier();
		expect(
			verifier.verify({
				certPem: "invalid-pem",
				nonce: "nonce",
				signature: "!!!invalid-b64!!!",
			})
		).toBe(false);
	});

	it("should return false when signature does not match cert", () => {
		const verifier = new PopVerifier();
		expect(
			verifier.verify({
				certPem: "invalid-pem",
				nonce: "nonce",
				signature: "dGVzdA==",
			})
		).toBe(false);
	});
});
