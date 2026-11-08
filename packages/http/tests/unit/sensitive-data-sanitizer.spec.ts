import { describe, expect, it } from "@jest/globals";
import { isSensitiveKey } from "@trading-model/http/infrastructure/sensitive-data-sanitizer";

describe("isSensitiveKey", () => {
	it.each([
		"accessToken",
		"instanceToken",
		"x-api-key",
		"signature",
		"X-Signature",
		"hmac",
		"password",
		"Authorization",
		"set-cookie",
		"ip",
		"x-forwarded-for",
		"client_ip",
	])("masks %s", (key) => {
		expect(isSensitiveKey(key)).toBe(true);
	});

	it.each(["symbol", "keyCount", "monkey", "cacheKey", "idempotencyKey"])(
		"keeps %s readable",
		(key) => {
			expect(isSensitiveKey(key)).toBe(false);
		}
	);
});
