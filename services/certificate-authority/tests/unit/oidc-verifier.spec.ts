import { generateKeyPairSync } from "node:crypto";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("@trading-model/common/config/logger", () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { OidcVerifier } from "../../src/core/oidc-verifier";

const MOCK_CONFIG = {
	issuer: "https://auth.example.com/",
	audience: "api-gateway",
	jwksUri: "https://auth.example.com/.well-known/jwks.json",
};

function createRsaJwk(): {
	jwk: Record<string, string>;
	kid: string;
	privateKeyPem: string;
} {
	const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
	const pub = keys.publicKey.export({ format: "jwk" }) as Record<
		string,
		string
	>;
	const kid = "test-key-1";
	const privPem = keys.privateKey.export({
		type: "pkcs1",
		format: "pem",
	}) as string;
	return {
		jwk: { kty: "RSA", n: pub.n, e: pub.e, kid },
		kid,
		privateKeyPem: privPem,
	};
}

function makeUnsignedToken(
	payload: Record<string, unknown>,
	algo = "RS256",
	kid?: string
): { token: string; message: string } {
	const header: Record<string, string> = { alg: algo, typ: "JWT" };
	if (kid) {
		header.kid = kid;
	}
	const hdr = Buffer.from(JSON.stringify(header)).toString("base64url");
	const payl = Buffer.from(JSON.stringify(payload)).toString("base64url");
	return { token: `${hdr}.${payl}.placeholder`, message: `${hdr}.${payl}` };
}

const defaultPayload = () => ({
	sub: "user-123",
	iss: MOCK_CONFIG.issuer,
	aud: MOCK_CONFIG.audience,
	exp: Math.floor(Date.now() / 1000) + 3600,
	iat: Math.floor(Date.now() / 1000),
});

describe("OidcVerifier", () => {
	let verifier: OidcVerifier;

	beforeEach(() => {
		jest.clearAllMocks();
		verifier = new OidcVerifier(MOCK_CONFIG);
	});

	describe("verifyAndExtract", () => {
		it("should reject invalid JWT format (not 3 parts)", async () => {
			await expect(verifier.verifyAndExtract("invalid")).rejects.toThrow(
				"Invalid JWT format"
			);
		});

		it("should reject token with disallowed algorithm", async () => {
			const { token } = makeUnsignedToken(defaultPayload(), "HS256");
			await expect(verifier.verifyAndExtract(token)).rejects.toThrow(
				'JWT algorithm "HS256" is not allowed'
			);
		});

		it("should reject token with wrong issuer", async () => {
			const { token } = makeUnsignedToken({
				...defaultPayload(),
				iss: "https://evil.com/",
			});
			await expect(verifier.verifyAndExtract(token)).rejects.toThrow(
				"JWT issuer mismatch"
			);
		});

		it("should reject token with wrong audience", async () => {
			const { token } = makeUnsignedToken({
				...defaultPayload(),
				aud: "wrong-audience",
			});
			await expect(verifier.verifyAndExtract(token)).rejects.toThrow(
				"JWT audience mismatch"
			);
		});

		it("should reject expired token", async () => {
			const { token } = makeUnsignedToken({
				...defaultPayload(),
				exp: Math.floor(Date.now() / 1000) - 3600,
			});
			await expect(verifier.verifyAndExtract(token)).rejects.toThrow(
				"JWT expired"
			);
		});

		it("should reject token not yet valid (nbf)", async () => {
			const { token } = makeUnsignedToken({
				...defaultPayload(),
				nbf: Math.floor(Date.now() / 1000) + 3600,
			});
			await expect(verifier.verifyAndExtract(token)).rejects.toThrow(
				"JWT not yet valid"
			);
		});

		it("should throw when JWKS fetch fails and no cached keys", async () => {
			(globalThis as any).fetch = jest
				.fn()
				.mockRejectedValue(new Error("Network error"));

			const { token } = makeUnsignedToken(
				defaultPayload(),
				"RS256",
				"test-key-1"
			);
			await expect(verifier.verifyAndExtract(token)).rejects.toThrow(
				"Network error"
			);
		});

		it("should throw when JWKS returns non-ok status", async () => {
			(globalThis as any).fetch = jest
				.fn()
				.mockResolvedValue({ ok: false, status: 500 });

			const { token } = makeUnsignedToken(
				defaultPayload(),
				"RS256",
				"test-key-1"
			);
			await expect(verifier.verifyAndExtract(token)).rejects.toThrow(
				"JWKS fetch failed"
			);
		});

		it("should use cached keys and not re-fetch within TTL after successful fetch", async () => {
			const { jwk } = createRsaJwk();
			const fetchMock = jest.fn().mockResolvedValue({
				ok: true,
				json: () => Promise.resolve({ keys: [jwk] }),
			});
			(globalThis as any).fetch = fetchMock;

			await (verifier as any)._refreshKeys();
			expect(fetchMock).toHaveBeenCalledTimes(1);
			await (verifier as any)._refreshKeys();
			expect(fetchMock).toHaveBeenCalledTimes(1);
		});

		it("should accept audience as string array", async () => {
			const { jwk } = createRsaJwk();
			(globalThis as any).fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: () => Promise.resolve({ keys: [jwk] }),
			});

			const payload = {
				...defaultPayload(),
				aud: [MOCK_CONFIG.audience, "other-app"],
			};
			const { token } = makeUnsignedToken(payload);
			await expect(verifier.verifyAndExtract(token)).rejects.toThrow(
				"JWT signature verification failed"
			);
		});

		it("should reject with invalid signature", async () => {
			const { jwk, kid } = createRsaJwk();
			(globalThis as any).fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: () => Promise.resolve({ keys: [jwk] }),
			});

			const payload = defaultPayload();
			const hdr = Buffer.from(
				JSON.stringify({ alg: "RS256", kid, typ: "JWT" })
			).toString("base64url");
			const payl = Buffer.from(JSON.stringify(payload)).toString("base64url");
			const wrongSig = Buffer.from("invalid-signature").toString("base64url");
			const token = `${hdr}.${payl}.${wrongSig}`;

			await expect(verifier.verifyAndExtract(token)).rejects.toThrow(
				"JWT signature verification failed"
			);
		});

		it("should throw when signing key not found by kid", async () => {
			const { jwk } = createRsaJwk();
			(globalThis as any).fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: () => Promise.resolve({ keys: [jwk] }),
			});

			const payload = defaultPayload();
			const hdr = Buffer.from(
				JSON.stringify({ alg: "RS256", kid: "nonexistent", typ: "JWT" })
			).toString("base64url");
			const payl = Buffer.from(JSON.stringify(payload)).toString("base64url");
			const token = `${hdr}.${payl}.dGVzdA==`;

			await expect(verifier.verifyAndExtract(token)).rejects.toThrow(
				"Signing key not found"
			);
		});
	});

	describe("_parseBase64Json", () => {
		it("should throw on invalid base64url", () => {
			expect(() => (verifier as any)._parseBase64Json("!!!invalid")).toThrow(
				"Failed to parse JWT segment"
			);
		});
	});

	describe("_toNodeCryptoAlgorithm", () => {
		it("should throw on unsupported algorithm", () => {
			expect(() => (verifier as any)._toNodeCryptoAlgorithm("HS256")).toThrow(
				"Unsupported JWT algorithm"
			);
		});

		it("should map algorithms correctly", () => {
			expect((verifier as any)._toNodeCryptoAlgorithm("RS256")).toBe(
				"RSA-SHA256"
			);
			expect((verifier as any)._toNodeCryptoAlgorithm("ES256")).toBe("SHA256");
		});
	});

	it("should construct with custom allowed algorithms", () => {
		const v = new OidcVerifier({
			...MOCK_CONFIG,
			allowedAlgorithms: ["ES256"],
		});
		expect(v).toBeDefined();
	});
});
