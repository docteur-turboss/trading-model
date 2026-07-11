import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import { ClaimValidator } from "../../src/core/claim-validator";
import type { OidcClaims } from "../../src/core/oidc-verifier";

const MOCK_CONFIG = {
	issuer: "https://auth.example.com/",
	audience: "api-gateway",
};

function makePayload(overrides: Partial<OidcClaims> = {}): OidcClaims {
	const now = Math.floor(Date.now() / 1000);
	return {
		sub: "user-123",
		iss: MOCK_CONFIG.issuer,
		aud: MOCK_CONFIG.audience,
		exp: now + 3600,
		iat: now,
		...overrides,
	} as OidcClaims;
}

describe("ClaimValidator", () => {
	let validator: ClaimValidator;

	beforeEach(() => {
		jest.clearAllMocks();
		validator = new ClaimValidator(MOCK_CONFIG);
	});

	describe("validate", () => {
		it("should pass for valid payload", () => {
			expect(() => validator.validate(makePayload())).not.toThrow();
		});

		it("should throw for wrong issuer", () => {
			expect(() =>
				validator.validate(makePayload({ iss: "https://evil.com/" }))
			).toThrow("JWT issuer mismatch");
		});

		it("should throw for missing audience", () => {
			expect(() =>
				validator.validate(makePayload({ aud: "wrong-audience" }))
			).toThrow("JWT audience mismatch");
		});

		it("should accept audience in string array", () => {
			expect(() =>
				validator.validate(
					makePayload({ aud: [MOCK_CONFIG.audience, "other-app"] })
				)
			).not.toThrow();
		});

		it("should throw for expired token", () => {
			expect(() =>
				validator.validate(
					makePayload({ exp: Math.floor(Date.now() / 1000) - 3600 })
				)
			).toThrow("JWT expired");
		});

		it("should throw for token not yet valid (nbf)", () => {
			expect(() =>
				validator.validate(
					makePayload({ nbf: Math.floor(Date.now() / 1000) + 3600 })
				)
			).toThrow("JWT not yet valid (nbf)");
		});

		it("should pass when nbf is not set", () => {
			expect(() =>
				validator.validate(makePayload({ nbf: undefined } as any))
			).not.toThrow();
		});
	});

	describe("assertIssuer", () => {
		it("should throw on issuer mismatch", () => {
			expect(() =>
				validator.assertIssuer(makePayload({ iss: "wrong" }))
			).toThrow("JWT issuer mismatch");
		});
	});

	describe("assertAudience", () => {
		it("should throw on audience mismatch", () => {
			expect(() =>
				validator.assertAudience(makePayload({ aud: "wrong" }))
			).toThrow("JWT audience mismatch");
		});
	});

	describe("assertNotExpired", () => {
		it("should throw when expired", () => {
			expect(() =>
				validator.assertNotExpired(
					makePayload({ exp: Math.floor(Date.now() / 1000) - 1 })
				)
			).toThrow("JWT expired");
		});
	});

	describe("assertNotBefore", () => {
		it("should throw when nbf is in the future", () => {
			expect(() =>
				validator.assertNotBefore(
					makePayload({ nbf: Math.floor(Date.now() / 1000) + 3600 })
				)
			).toThrow("JWT not yet valid (nbf)");
		});

		it("should pass when nbf is in the past", () => {
			expect(() =>
				validator.assertNotBefore(
					makePayload({ nbf: Math.floor(Date.now() / 1000) - 3600 })
				)
			).not.toThrow();
		});

		it("should pass when nbf is not set", () => {
			expect(() => validator.assertNotBefore(makePayload())).not.toThrow();
		});
	});
});
