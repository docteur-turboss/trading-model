import { createHmac, timingSafeEqual } from "node:crypto";
import { describe, expect, it, jest } from "@jest/globals";
import { validInstanceToken } from "@trading-model/crypto/crypto/token-validator";

describe("validInstanceToken", () => {
	it("should return false for malformed token", () => {
		expect(
			validInstanceToken({
				token: "invalid",
				instanceId: "i-abc" as never,
				signingSecret: "secret",
				storedToken: undefined,
			})
		).toBe(false);
	});

	it("should return false for wrong number of parts", () => {
		expect(
			validInstanceToken({
				token: "part1.part2",
				instanceId: "i-abc" as never,
				signingSecret: "secret",
				storedToken: undefined,
			})
		).toBe(false);
	});

	it("should return false for mismatched instance ID", () => {
		const encodedId = Buffer.from("i-abc123").toString("base64url");
		const hmac = createHmac("sha256", "secret")
			.update(`${encodedId}.bm9uY2U`)
			.digest("base64url");
		const token = `${encodedId}.bm9uY2U.${hmac}`;
		expect(
			validInstanceToken({
				token,
				instanceId: "i-different" as never,
				signingSecret: "secret",
				storedToken: undefined,
			})
		).toBe(false);
	});

	it("should return false for wrong secret", () => {
		const encodedId = Buffer.from("i-abc123").toString("base64url");
		const hmac = createHmac("sha256", "correct-secret")
			.update(`${encodedId}.bm9uY2U`)
			.digest("base64url");
		const token = `${encodedId}.bm9uY2U.${hmac}`;
		expect(
			validInstanceToken({
				token,
				instanceId: "i-abc123" as never,
				signingSecret: "wrong-secret",
				storedToken: undefined,
			})
		).toBe(false);
	});

	it("should return true when storedToken matches token (early return)", () => {
		const encodedId = Buffer.from("i-abc123").toString("base64url");
		const hmac = createHmac("sha256", "secret")
			.update(`${encodedId}.bm9uY2U`)
			.digest("base64url");
		const token = `${encodedId}.bm9uY2U.${hmac}`;
		expect(
			validInstanceToken({
				token,
				instanceId: "i-abc123" as never,
				signingSecret: "secret",
				storedToken: token,
			})
		).toBe(true);
	});

	it("should return true with sliding expiry when stored token is valid", () => {
		const encodedId = Buffer.from("i-abc123").toString("base64url");
		const tokenHmac = createHmac("sha256", "secret")
			.update(`${encodedId}.bm9uY2U`)
			.digest("base64url");
		const token = `${encodedId}.bm9uY2U.${tokenHmac}`;
		const storedHmac = createHmac("sha256", "secret")
			.update(`${encodedId}.b3RoZXItbm9uY2U=`)
			.digest("base64url");
		const storedToken = `${encodedId}.b3RoZXItbm9uY2U=.${storedHmac}`;
		expect(
			validInstanceToken({
				token,
				instanceId: "i-abc123" as never,
				signingSecret: "secret",
				storedToken,
				options: { allowSlidingExpiry: true },
			})
		).toBe(true);
	});

	it("should return false with sliding expiry when stored token has wrong secret", () => {
		const encodedId = Buffer.from("i-abc123").toString("base64url");
		const tokenHmac = createHmac("sha256", "secret")
			.update(`${encodedId}.bm9uY2U`)
			.digest("base64url");
		const token = `${encodedId}.bm9uY2U.${tokenHmac}`;
		const storedHmac = createHmac("sha256", "other-secret")
			.update(`${encodedId}.bm9uY2U`)
			.digest("base64url");
		const storedToken = `${encodedId}.bm9uY2U.${storedHmac}`;
		expect(
			validInstanceToken({
				token,
				instanceId: "i-abc123" as never,
				signingSecret: "secret",
				storedToken,
				options: { allowSlidingExpiry: true },
			})
		).toBe(false);
	});

	it("should return false when sliding expiry is disabled and storedToken is different", () => {
		const encodedId = Buffer.from("i-abc123").toString("base64url");
		const tokenHmac = createHmac("sha256", "secret")
			.update(`${encodedId}.bm9uY2U`)
			.digest("base64url");
		const token = `${encodedId}.bm9uY2U.${tokenHmac}`;
		const storedHmac = createHmac("sha256", "secret")
			.update(`${encodedId}.ZGlmZmVyZW50`)
			.digest("base64url");
		const storedToken = `${encodedId}.ZGlmZmVyZW50.${storedHmac}`;
		expect(
			validInstanceToken({
				token,
				instanceId: "i-abc123" as never,
				signingSecret: "secret",
				storedToken,
			})
		).toBe(false);
	});

	describe("legacy tokens (4 parts)", () => {
		it("should reject legacy token with invalid timestamp encoding", () => {
			const encodedId = Buffer.from("i-abc123").toString("base64url");
			const payload = `${encodedId}.aW52YWxpZCF0aW1lc3RhbXA=.bm9uY2U`;
			const hmac = createHmac("sha256", "secret")
				.update(payload)
				.digest("base64url");
			const token = `${payload}.${hmac}`;
			expect(
				validInstanceToken({
					token,
					instanceId: "i-abc123" as never,
					signingSecret: "secret",
					storedToken: undefined,
				})
			).toBe(false);
		});

		it("should reject legacy token with expired timestamp", () => {
			const old = Date.now() - 600_000;
			const encodedId = Buffer.from("i-abc123").toString("base64url");
			const tsB64 = Buffer.from(String(old)).toString("base64url");
			const hmac = createHmac("sha256", "secret")
				.update(`${encodedId}.${tsB64}.bm9uY2U`)
				.digest("base64url");
			const token = `${encodedId}.${tsB64}.bm9uY2U.${hmac}`;
			expect(
				validInstanceToken({
					token,
					instanceId: "i-abc123" as never,
					signingSecret: "secret",
					storedToken: undefined,
				})
			).toBe(false);
		});

		it("should reject legacy token with future timestamp beyond skew", () => {
			const future = Date.now() + 60_000;
			const encodedId = Buffer.from("i-abc123").toString("base64url");
			const tsB64 = Buffer.from(String(future)).toString("base64url");
			const hmac = createHmac("sha256", "secret")
				.update(`${encodedId}.${tsB64}.bm9uY2U`)
				.digest("base64url");
			const token = `${encodedId}.${tsB64}.bm9uY2U.${hmac}`;
			expect(
				validInstanceToken({
					token,
					instanceId: "i-abc123" as never,
					signingSecret: "secret",
					storedToken: undefined,
				})
			).toBe(false);
		});
	});

	describe("HMAC timingSafeEqual catch", () => {
		it("should return false when timingSafeEqual throws", () => {
			const encodedId = Buffer.from("i-abc123").toString("base64url");
			const hmac = createHmac("sha256", "secret")
				.update(`${encodedId}.bm9uY2U`)
				.digest("base64url");
			const token = `${encodedId}.bm9uY2U.${hmac}`;
			const spy = jest.spyOn({ timingSafeEqual }, "timingSafeEqual");
			spy.mockImplementationOnce(() => {
				throw new TypeError("buffers must have same length");
			});
			const result = validInstanceToken({
				token,
				instanceId: "i-abc123" as never,
				signingSecret: "secret",
				storedToken: undefined,
			});
			expect(result).toBe(false);
			spy.mockRestore();
		});
	});
});
