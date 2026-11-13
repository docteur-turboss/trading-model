import { InstanceId } from "@trading-model/primitives/primitives";
import { createHmacSha256Formatted } from "../src/adapters/outbound/node-hmac";
import { generateRandomStr } from "../src/adapters/outbound/node-random";
import { generateInstanceToken } from "../src/application/services/token-generator";
import { validInstanceToken } from "../src/application/services/token-validator";
import { CryptoAlg } from "../src/domain/constants/crypto-constants";

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
	const hmac = createHmacSha256Formatted({
		secret,
		parts: [encodedId, timestampB64, nonce],
		separator: ".",
		digest: CryptoAlg.BASE64URL,
	});
	return `${encodedId}.${timestampB64}.${nonce}.${hmac}`;
}

/** Always changes the first character: the random nonce makes it unpredictable. */
function tamper(part: string): string {
	return (part[0] === "X" ? "Y" : "X") + part.slice(1);
}

const instanceIdStr = "token-validation-test-instance";
const instanceId = InstanceId.of(instanceIdStr);
const signingSecret = "test-signing-secret-123456";

function validOptions() {
	const token = generateInstanceToken(instanceId, signingSecret);
	return { token, instanceId, signingSecret, storedToken: token };
}

describe("validInstanceToken", () => {
	describe("valid tokens", () => {
		it("should return true for a valid 3-part token equal to the stored token", () => {
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
			});
			expect(result).toBe(false);
		});
	});

	describe("tampered signature", () => {
		it("should return false when the HMAC signature is tampered", () => {
			const opts = validOptions();
			const parts = opts.token.split(".");
			parts[2] = tamper(parts[2]);
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

	describe("stored token", () => {
		it("should return false for a validly signed token that differs from the stored token", () => {
			const result = validInstanceToken({
				...validOptions(),
				storedToken: generateInstanceToken(instanceId, signingSecret),
			});
			expect(result).toBe(false);
		});

		it("should return false when storedToken is null", () => {
			const result = validInstanceToken({
				...validOptions(),
				storedToken: null,
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
				options: { maxAgeMs: 100_000 },
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
			const result = validInstanceToken({
				token: legacyToken,
				instanceId: instance,
				signingSecret,
				storedToken: legacyToken,
				options: { maxAgeMs: 300_000 },
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
			const result = validInstanceToken({
				token: legacyToken,
				instanceId: instance,
				signingSecret,
				storedToken: legacyToken,
				options: {
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
					clockSkewToleranceMs: 5_000,
				},
			});
			expect(result).toBe(false);
		});
	});
});
