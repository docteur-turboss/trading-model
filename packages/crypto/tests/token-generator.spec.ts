import { InstanceId } from "@trading-model/common/domain/primitives";
import { generateInstanceToken } from "../src/crypto/token-generator";

describe("generateInstanceToken", () => {
	const instanceId = InstanceId.of("test-instance-abc");
	const signingSecret = "my-signing-secret-12345";

	it("should return a string with 3 parts separated by dots", () => {
		const token = generateInstanceToken(instanceId, signingSecret);
		const parts = token.split(".");
		expect(parts).toHaveLength(3);
	});

	it("should have the first part be base64url-encoded instanceId", () => {
		const token = generateInstanceToken(instanceId, signingSecret);
		const encodedId = token.split(".")[0];
		const decodedId = Buffer.from(encodedId, "base64url").toString("utf8");
		expect(decodedId).toBe("test-instance-abc");
	});

	it("should produce different tokens for the same input (nonce differs)", () => {
		const token1 = generateInstanceToken(instanceId, signingSecret);
		const token2 = generateInstanceToken(instanceId, signingSecret);
		expect(token1).not.toBe(token2);
	});

	it("should produce different tokens for different signing secrets", () => {
		const token1 = generateInstanceToken(instanceId, "secret-one-1234567");
		const token2 = generateInstanceToken(instanceId, "secret-two-7654321");
		expect(token1).not.toBe(token2);
	});
});
