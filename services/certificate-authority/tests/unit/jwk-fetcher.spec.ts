import { generateKeyPairSync } from "node:crypto";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("@trading-model/crypto/crypto/crypto-constants", () => ({
	JWK_KEY_TYPE: { RSA: "RSA", EC: "EC" },
}));

import { JwkFetcher } from "../../src/core/jwk-fetcher";

const rsaKey = generateKeyPairSync("rsa", { modulusLength: 2048 });

function getTestRsaJwk(): Record<string, string> {
	const pub = rsaKey.publicKey.export({ format: "jwk" }) as Record<
		string,
		string
	>;
	return { kty: "RSA", n: pub.n!, e: pub.e!, kid: "test-rsa-key" };
}

describe("JwkFetcher", () => {
	let fetcher: JwkFetcher;
	let originalFetch: any;

	beforeEach(() => {
		jest.clearAllMocks();
		fetcher = new JwkFetcher();
		originalFetch = (globalThis as any).fetch;
		(globalThis as any).fetch = jest.fn();
	});

	afterEach(() => {
		(globalThis as any).fetch = originalFetch;
	});

	it("should fetch and parse RSA JWK keys", async () => {
		(globalThis as any).fetch = jest.fn().mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					keys: [getTestRsaJwk()],
				}),
		});

		const result = await fetcher.fetch("https://example.com/jwks" as any);
		expect(result).toHaveLength(1);
		expect(result[0].kid).toBe("test-rsa-key");
		expect(result[0].key).toBeDefined();
	});

	it("should generate kid from modulus when kid is missing for RSA", async () => {
		const jwk = getTestRsaJwk();
		delete jwk.kid;

		(globalThis as any).fetch = jest.fn().mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					keys: [jwk],
				}),
		});

		const result = await fetcher.fetch("https://example.com/jwks" as any);
		expect(result).toHaveLength(1);
		expect(result[0].kid).toBe(jwk.n!.slice(0, 16));
	});

	it("should skip unsupported key types", async () => {
		(globalThis as any).fetch = jest.fn().mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					keys: [{ kty: "OKP", crv: "Ed25519", x: "some-key" }],
				}),
		});

		const result = await fetcher.fetch("https://example.com/jwks" as any);
		expect(result).toHaveLength(0);
	});

	it("should skip RSA keys without modulus", async () => {
		(globalThis as any).fetch = jest.fn().mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					keys: [{ kty: "RSA", e: "AQAB" }],
				}),
		});

		const result = await fetcher.fetch("https://example.com/jwks" as any);
		expect(result).toHaveLength(0);
	});

	it("should skip EC keys without x or y coordinates", async () => {
		(globalThis as any).fetch = jest.fn().mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					keys: [{ kty: "EC", crv: "P-256", x: "some-x" }],
				}),
		});

		const result = await fetcher.fetch("https://example.com/jwks" as any);
		expect(result).toHaveLength(0);
	});

	it("should throw on non-ok response", async () => {
		(globalThis as any).fetch = jest.fn().mockResolvedValue({
			ok: false,
			status: 500,
		});

		await expect(
			fetcher.fetch("https://example.com/jwks" as any)
		).rejects.toThrow("JWKS fetch failed: 500");
	});

	it("should throw on network error", async () => {
		(globalThis as any).fetch = jest
			.fn()
			.mockRejectedValue(new Error("Network error"));

		await expect(
			fetcher.fetch("https://example.com/jwks" as any)
		).rejects.toThrow("Network error");
	});

	it("should handle multiple keys", async () => {
		const jwk1 = getTestRsaJwk();
		const jwk2 = getTestRsaJwk();
		jwk2.kid = "test-rsa-key-2";

		(globalThis as any).fetch = jest.fn().mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					keys: [jwk1, jwk2],
				}),
		});

		const result = await fetcher.fetch("https://example.com/jwks" as any);
		expect(result).toHaveLength(2);
	});

	it("should use AbortSignal.timeout for fetch", async () => {
		let signal: AbortSignal | undefined;
		(globalThis as any).fetch = jest
			.fn()
			.mockImplementation((_url: string, opts: any) => {
				signal = opts?.signal;
				return Promise.resolve({
					ok: true,
					json: () => Promise.resolve({ keys: [] }),
				});
			});

		await fetcher.fetch("https://example.com/jwks" as any);
		expect(signal).toBeDefined();
	});
});
