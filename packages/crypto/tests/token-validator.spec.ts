import { createHmac } from "node:crypto";
import { InstanceId } from "@trading-model/common/domain/primitives";
import { CryptoAlg } from "../src/crypto/crypto-constants";
import { generateRandomStr } from "../src/crypto/random";
import { generateInstanceToken } from "../src/crypto/token-generator";
import { validInstanceToken } from "../src/crypto/token-validator";

function createLegacyToken(
	instanceId: string,
	secret: string,
	timestamp: number
): string {
	const encodedId = Buffer.from(instanceId).toString(CryptoAlg.BASE64URL);
	const timestampB64 = Buffer.from(String(timestamp)).toString(
		CryptoAlg.BASE64URL
	);
	const nonce = generateRandomStr();
	const hmac = createHmac(CryptoAlg.SHA256, secret)
		.update(`${encodedId}.${timestampB64}.${nonce}`)
		.digest(CryptoAlg.BASE64URL);
	return `${encodedId}.${timestampB64}.${nonce}.${hmac}`;
}

const instanceIdStr = "token-validation-test-instance";
const instanceId = InstanceId.of(instanceIdStr);
const signingSecret = "test-signing-secret-123456";

function validOptions() {
	const storedToken = generateInstanceToken(instanceId, signingSecret);
	return {
		token: generateInstanceToken(instanceId, signingSecret),
		instanceId,
		signingSecret,
		storedToken,
		options: { allowSlidingExpiry: true } as const,
	};
}

describe("validInstanceToken", () => {
	describe("valid tokens", () => {
		it("should return true for a valid 3-part token with allowSlidingExpiry", () => {
			const result = validInstanceToken(validOptions());
			expect(result).toBe(true);
		});

		it("should return true when storedToken === token (immediate match)", () => {
			const token = generateInstanceToken(instanceId, signingSecret);
			const result = validInstanceToken({
				token,
				instanceId,
				signingSecret,
				storedToken: token,
			});
			expect(result).toBe(true);
		});
	});

	describe("wrong instanceId", () => {
		it("should return false when instanceId does not match", () => {
			const wrongInstanceId = InstanceId.of("different-instance");
			const opts = validOptions();
			const result = validInstanceToken({
				...opts,
				instanceId: wrongInstanceId,
			});
			expect(result).toBe(false);
		});
	});

	describe("malformed token", () => {
		it("should return false for token with 2 parts", () => {
			const opts = validOptions();
			const result = validInstanceToken({
				...opts,
				token: "part1.part2",
			});
			expect(result).toBe(false);
		});

		it("should return false for token with 5 parts", () => {
			const opts = validOptions();
			const result = validInstanceToken({
				...opts,
				token: "a.b.c.d.e",
			});
			expect(result).toBe(false);
		});

		it("should return false for empty token", () => {
			const opts = validOptions();
			const result = validInstanceToken({ ...opts, token: "" });
			expect(result).toBe(false);
		});
	});

	describe("expired token (legacy 4-part format)", () => {
		it("should return false for a legacy token with an old timestamp", () => {
			const instance = InstanceId.of(instanceIdStr);
			const oldTimestamp = Date.now() - 600_000;
			const legacyToken = createLegacyToken(
				instanceIdStr,
				signingSecret,
				oldTimestamp
			);
			const storedToken = generateInstanceToken(instance, signingSecret);
			const result = validInstanceToken({
				token: legacyToken,
				instanceId: instance,
				signingSecret,
				storedToken,
				options: { allowSlidingExpiry: true },
			});
			expect(result).toBe(false);
		});
	});

	describe("tampered signature", () => {
		it("should return false when the HMAC signature is tampered", () => {
			const opts = validOptions();
			const parts = opts.token.split(".");
			parts[2] = parts[2].replace(/[a-zA-Z0-9]/, "X");
			const result = validInstanceToken({
				...opts,
				token: parts.join("."),
			});
			expect(result).toBe(false);
		});

		it("should return false when the encodedId is tampered", () => {
			const opts = validOptions();
			const parts = opts.token.split(".");
			parts[0] = "YW5vdGhlci1pbnN0YW5jZQ";
			const result = validInstanceToken({
				...opts,
				token: parts.join("."),
			});
			expect(result).toBe(false);
		});
	});

	describe("allowSlidingExpiry with storedToken", () => {
		it("should return true when allowSlidingExpiry is enabled and storedToken is valid", () => {
			const result = validInstanceToken(validOptions());
			expect(result).toBe(true);
		});

		it("should return false when allowSlidingExpiry is false and storedToken differs", () => {
			const opts = validOptions();
			const result = validInstanceToken({
				...opts,
				options: { allowSlidingExpiry: false },
			});
			expect(result).toBe(false);
		});

		it("should return false when storageToken is null even with allowSlidingExpiry", () => {
			const token = generateInstanceToken(instanceId, signingSecret);
			const result = validInstanceToken({
				token,
				instanceId,
				signingSecret,
				storedToken: null,
				options: { allowSlidingExpiry: true },
			});
			expect(result).toBe(false);
		});

		it("should return false when storedToken is invalid (tampered)", () => {
			const token = generateInstanceToken(instanceId, signingSecret);
			const storedToken = generateInstanceToken(instanceId, signingSecret);
			const storedParts = storedToken.split(".");
			storedParts[2] = storedParts[2].replace(/[a-zA-Z0-9]/, "X");
			const invalidStored = storedParts.join(".");
			const result = validInstanceToken({
				token,
				instanceId,
				signingSecret,
				storedToken: invalidStored,
				options: { allowSlidingExpiry: true },
			});
			expect(result).toBe(false);
		});
	});

	describe("maxAgeMs option", () => {
		it("should reject a legacy token older than maxAgeMs", () => {
			const instance = InstanceId.of(instanceIdStr);
			const oldTimestamp = Date.now() - 200_000;
			const legacyToken = createLegacyToken(
				instanceIdStr,
				signingSecret,
				oldTimestamp
			);
			const storedToken = generateInstanceToken(instance, signingSecret);
			const result = validInstanceToken({
				token: legacyToken,
				instanceId: instance,
				signingSecret,
				storedToken,
				options: { allowSlidingExpiry: true, maxAgeMs: 100_000 },
			});
			expect(result).toBe(false);
		});

		it("should accept a legacy token within maxAgeMs", () => {
			const instance = InstanceId.of(instanceIdStr);
			const recentTimestamp = Date.now() - 50_000;
			const legacyToken = createLegacyToken(
				instanceIdStr,
				signingSecret,
				recentTimestamp
			);
			const storedToken = generateInstanceToken(instance, signingSecret);
			const result = validInstanceToken({
				token: legacyToken,
				instanceId: instance,
				signingSecret,
				storedToken,
				options: { allowSlidingExpiry: true, maxAgeMs: 300_000 },
			});
			expect(result).toBe(true);
		});
	});

	describe("clockSkewToleranceMs option", () => {
		it("should allow a slightly-future timestamp within clock skew tolerance", () => {
			const instance = InstanceId.of(instanceIdStr);
			const futureTimestamp = Date.now() + 3_000;
			const legacyToken = createLegacyToken(
				instanceIdStr,
				signingSecret,
				futureTimestamp
			);
			const storedToken = generateInstanceToken(instance, signingSecret);
			const result = validInstanceToken({
				token: legacyToken,
				instanceId: instance,
				signingSecret,
				storedToken,
				options: {
					allowSlidingExpiry: true,
					clockSkewToleranceMs: 10_000,
				},
			});
			expect(result).toBe(true);
		});

		it("should reject a legacy token with timestamp too far in the future", () => {
			const instance = InstanceId.of(instanceIdStr);
			const farFutureTimestamp = Date.now() + 60_000;
			const legacyToken = createLegacyToken(
				instanceIdStr,
				signingSecret,
				farFutureTimestamp
			);
			const storedToken = generateInstanceToken(instance, signingSecret);
			const result = validInstanceToken({
				token: legacyToken,
				instanceId: instance,
				signingSecret,
				storedToken,
				options: {
					allowSlidingExpiry: true,
					clockSkewToleranceMs: 5_000,
				},
			});
			expect(result).toBe(false);
		});
	});
});
