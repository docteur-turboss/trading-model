import { safeStringify as baseSafeStringify } from "../utils/safe-stringify";
import { sanitizeForLog } from "../utils/sanitize";

const SENSITIVE_KEY_PATTERNS = [
	/^password$/i,
	/^token$/i,
	/^secret$/i,
	/^authorization$/i,
	/^cookie$/i,
	/^api[-_]?key$/i,
	/^api[-_]?secret$/i,
	/^mysql_root_password$/i,
	/^db_password$/i,
	/^jwt[-_]?secret$/i,
	/^private[-_]?key$/i,
	/^tls[-_]?(key|cert|ca)$/i,
	/^certificatepath$/i,
	/^keycertificatepath$/i,
	/^rootcacertpath$/i,
	/\.secret$/i,
	/\.token$/i,
];

export function isSensitiveKey(key: string): boolean {
	return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

export function safeStringify(value: unknown): string {
	return baseSafeStringify(value, undefined, (key, val) => {
		if (key && isSensitiveKey(key)) {
			return "[REDACTED]";
		}
		return sanitizeForLog(val);
	});
}
