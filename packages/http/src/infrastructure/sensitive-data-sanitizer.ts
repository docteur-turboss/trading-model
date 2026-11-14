import { safeStringify as baseSafeStringify } from "@trading-model/common/utils/safe-stringify";
import { sanitizeForLog } from "@trading-model/common/utils/sanitize";

// Partial, case-insensitive: catches accessToken, x-api-key, X-Signature. False positives (e.g. tokenCount) are accepted; bare /key/ is not matched (cacheKey, idempotencyKey stay readable).
const SENSITIVE_KEY_PATTERNS = [
	/token|secret|password|passwd|signature|hmac|authorization|cookie|api[-_]?key|private[-_]?key/i,
	/^tls[-_]?(key|cert|ca)$/i,
	/^certificatepath$/i,
	/^keycertificatepath$/i,
	/^rootcacertpath$/i,
	/^ip$/i,
	/^ip[-_]?address$/i,
	/^remote[-_]?address$/i,
	/^x[-_]?forwarded[-_]?for$/i,
	/^client[-_]?ip$/i,
	/^peer[-_]?address$/i,
];

/** True when a key name matches a sensitive pattern. */
export function isSensitiveKey(key: string): boolean {
	return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

/** JSON-stringifies a value with the values of sensitive keys redacted. */
export function safeStringify(value: unknown): string {
	return baseSafeStringify(value, undefined, (key, val) => {
		if (key && isSensitiveKey(key)) {
			return "[REDACTED]";
		}
		return sanitizeForLog(val);
	});
}
