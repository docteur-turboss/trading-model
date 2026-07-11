import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockVerifyInstance = {
	update: jest.fn().mockReturnThis(),
	verify: jest.fn().mockReturnValue(true),
};
const mockCreateVerify = jest.fn().mockReturnValue(mockVerifyInstance);

jest.mock("node:crypto", () => ({
	...(jest.requireActual("node:crypto") as any),
	createVerify: mockCreateVerify,
}));

jest.mock("@trading-model/common/config/logger", () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockResolveSigningKey = jest.fn();
jest.mock("../../src/core/jwks-key-provider", () => ({
	JwksKeyProvider: jest.fn().mockImplementation(() => ({
		resolveSigningKey: mockResolveSigningKey,
	})),
}));

import { type OidcConfig, OidcVerifier } from "../../src/core/oidc-verifier";

const MOCK_CONFIG: OidcConfig = {
	issuer: "https://auth.example.com/" as any,
	audience: "api-gateway",
	jwksUri: "https://auth.example.com/.well-known/jwks.json" as any,
};

function b64url(data: string): string {
	return Buffer.from(data).toString("base64url");
}

function makeJwt(
	payload: Record<string, unknown>,
	header: Record<string, string> = { alg: "RS256", typ: "JWT" }
): string {
	const hdr = b64url(JSON.stringify(header));
	const payl = b64url(JSON.stringify(payload));
	return `${hdr}.${payl}.${b64url("ignored-signature")}`;
}

function makeValidJwt(overrides: Record<string, unknown> = {}): string {
	const now = Math.floor(Date.now() / 1000);
	return makeJwt({
		sub: "user-123",
		iss: MOCK_CONFIG.issuer,
		aud: MOCK_CONFIG.audience,
		exp: now + 3600,
		iat: now,
		...overrides,
	});
}

describe("OidcVerifier", () => {
	let verifier: OidcVerifier;

	beforeEach(() => {
		jest.clearAllMocks();
		mockResolveSigningKey.mockReset();
		mockVerifyInstance.verify.mockReturnValue(true);
		verifier = new OidcVerifier(MOCK_CONFIG);
	});

	describe("verifyAndExtract", () => {
		it("should verify and extract claims from a valid token", async () => {
			mockResolveSigningKey.mockResolvedValue({} as any);
			const token = makeValidJwt();
			const claims = await verifier.verifyAndExtract(token);
			expect(claims.sub).toBe("user-123");
			expect(claims.iss).toBe(MOCK_CONFIG.issuer);
		});

		it("should reject invalid JWT format", async () => {
			await expect(verifier.verifyAndExtract("invalid")).rejects.toThrow(
				"Invalid JWT format"
			);
		});

		it("should reject token with disallowed algorithm", async () => {
			const token = makeJwt(
				{
					sub: "u1",
					iss: MOCK_CONFIG.issuer,
					aud: MOCK_CONFIG.audience,
					exp: 9999999999,
					iat: 0,
				},
				{ alg: "HS256", typ: "JWT" }
			);
			await expect(verifier.verifyAndExtract(token)).rejects.toThrow(
				'JWT algorithm "HS256" is not allowed'
			);
		});

		it("should reject token with wrong issuer", async () => {
			const token = makeValidJwt({ iss: "https://evil.com/" });
			await expect(verifier.verifyAndExtract(token)).rejects.toThrow(
				"JWT issuer mismatch"
			);
		});

		it("should reject token with wrong audience", async () => {
			const token = makeValidJwt({ aud: "wrong-audience" });
			await expect(verifier.verifyAndExtract(token)).rejects.toThrow(
				"JWT audience mismatch"
			);
		});

		it("should accept audience as string array", async () => {
			mockResolveSigningKey.mockResolvedValue({} as any);
			const token = makeValidJwt({ aud: [MOCK_CONFIG.audience, "other-app"] });
			const claims = await verifier.verifyAndExtract(token);
			expect(claims.aud).toEqual([MOCK_CONFIG.audience, "other-app"]);
		});

		it("should reject expired token", async () => {
			const token = makeValidJwt({
				exp: Math.floor(Date.now() / 1000) - 3600,
			});
			await expect(verifier.verifyAndExtract(token)).rejects.toThrow(
				"JWT expired"
			);
		});

		it("should reject token not yet valid (nbf)", async () => {
			const token = makeValidJwt({
				nbf: Math.floor(Date.now() / 1000) + 3600,
			});
			await expect(verifier.verifyAndExtract(token)).rejects.toThrow(
				"JWT not yet valid (nbf)"
			);
		});

		it("should reject with invalid signature", async () => {
			mockResolveSigningKey.mockResolvedValue({} as any);
			mockVerifyInstance.verify.mockReturnValue(false);

			const token = makeValidJwt();
			await expect(verifier.verifyAndExtract(token)).rejects.toThrow(
				"JWT signature verification failed"
			);
		});

		it("should throw when signing key not found by kid", async () => {
			mockResolveSigningKey.mockRejectedValue(
				new Error("Signing key not found (kid: test-key-1)")
			);

			const token = makeValidJwt();
			await expect(verifier.verifyAndExtract(token)).rejects.toThrow(
				"Signing key not found"
			);
		});
	});

	describe("construct with custom allowed algorithms", () => {
		it("should accept custom allowed algorithms", () => {
			const v = new OidcVerifier({
				...MOCK_CONFIG,
				allowedAlgorithms: ["ES256"],
			});
			expect(v).toBeDefined();
		});
	});

	describe("_toNodeCryptoAlgorithm", () => {
		it("should throw on unsupported algorithm", () => {
			expect(() => (verifier as any)._toNodeCryptoAlgorithm("HS256")).toThrow(
				"Unsupported JWT algorithm: HS256"
			);
		});

		it("should map RS256 to RSA-SHA256", () => {
			expect((verifier as any)._toNodeCryptoAlgorithm("RS256")).toBe(
				"RSA-SHA256"
			);
		});

		it("should map ES256 to SHA256", () => {
			expect((verifier as any)._toNodeCryptoAlgorithm("ES256")).toBe("SHA256");
		});

		it("should map other algorithms", () => {
			expect((verifier as any)._toNodeCryptoAlgorithm("RS384")).toBe(
				"RSA-SHA384"
			);
			expect((verifier as any)._toNodeCryptoAlgorithm("RS512")).toBe(
				"RSA-SHA512"
			);
			expect((verifier as any)._toNodeCryptoAlgorithm("ES384")).toBe("SHA384");
			expect((verifier as any)._toNodeCryptoAlgorithm("ES512")).toBe("SHA512");
		});
	});

	describe("_assertAllowedAlgorithm", () => {
		it("should not throw for allowed algorithm", () => {
			expect(() =>
				(verifier as any)._assertAllowedAlgorithm("RS256")
			).not.toThrow();
		});

		it("should throw for disallowed algorithm", () => {
			expect(() => (verifier as any)._assertAllowedAlgorithm("none")).toThrow(
				'JWT algorithm "none" is not allowed'
			);
		});
	});
});
