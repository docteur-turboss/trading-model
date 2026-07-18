import { describe, expect, it } from "@jest/globals";

import { verifyProofOfPossession } from "../../src/domain/pop-verifier";

describe("verifyProofOfPossession", () => {
	it("should return false for invalid certificate PEM", () => {
		expect(
			verifyProofOfPossession({
				certPem: "invalid-pem",
				nonce: "nonce",
				signature: "signature",
			})
		).toBe(false);
	});

	it("should return false for empty signature", () => {
		expect(
			verifyProofOfPossession({
				certPem: "invalid-pem",
				nonce: "nonce",
				signature: "",
			})
		).toBe(false);
	});

	it("should return false for invalid base64 signature", () => {
		expect(
			verifyProofOfPossession({
				certPem: "invalid-pem",
				nonce: "nonce",
				signature: "!!!invalid-b64!!!",
			})
		).toBe(false);
	});

	it("should return false when signature does not match cert", () => {
		expect(
			verifyProofOfPossession({
				certPem: "invalid-pem",
				nonce: "nonce",
				signature: "dGVzdA==",
			})
		).toBe(false);
	});
});
