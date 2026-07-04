import { randomBytes } from "node:crypto";
import { describe, expect, it } from "@jest/globals";

import { decryptKey, encryptKey } from "../../src/core/ca-crypto";

function generateKey(): string {
	return randomBytes(32).toString("base64");
}

describe("ca-crypto", () => {
	describe("encryptKey", () => {
		it("should return PEM unchanged when no key provided", () => {
			const result = encryptKey("my-pem-data", undefined);
			expect(result).toBe("my-pem-data");
		});

		it("should throw when key is not 32 bytes", () => {
			expect(() =>
				encryptKey("pem", Buffer.alloc(16).toString("base64"))
			).toThrow("32 bytes");
		});

		it("should encrypt with AES-256-GCM format", () => {
			const key = generateKey();
			const result = encryptKey("secret-pem-content", key);
			expect(result).toMatch(/^aes256gcm:/);
		});
	});

	describe("decryptKey", () => {
		it("should return data unchanged when no key provided", () => {
			const result = decryptKey("plain-data", undefined);
			expect(result).toBe("plain-data");
		});

		it("should return data unchanged when not in aes256gcm format", () => {
			const key = generateKey();
			const result = decryptKey("plain-data", key);
			expect(result).toBe("plain-data");
		});

		it("should throw when encrypted format has wrong parts", () => {
			const key = generateKey();
			expect(() => decryptKey("aes256gcm:too:few", key)).toThrow(
				"Invalid encrypted key format"
			);
		});

		it("should throw when key is not 32 bytes on decrypt", () => {
			expect(() =>
				decryptKey("aes256gcm:a:b:c", Buffer.alloc(16).toString("base64"))
			).toThrow("32 bytes");
		});

		it("should round-trip encrypt and decrypt", () => {
			const key = generateKey();
			const original = "my-sensitive-pem-data";
			const encrypted = encryptKey(original, key);
			const decrypted = decryptKey(encrypted, key);
			expect(decrypted).toBe(original);
		});

		it("should not decrypt with wrong key", () => {
			const original = "test-data";
			const encrypted = encryptKey(original, generateKey());
			const wrongKey = generateKey();
			expect(() => decryptKey(encrypted, wrongKey)).toThrow();
		});
	});
});
