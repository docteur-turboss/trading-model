export class SensitiveDataSanitizer {
	private static readonly SENSITIVE_KEY_PATTERNS = [
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

	static _isSensitiveKey(key: string): boolean {
		return SensitiveDataSanitizer.SENSITIVE_KEY_PATTERNS.some((pattern) =>
			pattern.test(key)
		);
	}

	safeStringify(value: unknown): string {
		const seen = new WeakSet<object>();
		return JSON.stringify(value, (key, val) => {
			if (key && SensitiveDataSanitizer._isSensitiveKey(key)) {
				return "[REDACTED]";
			}
			if (typeof val === "object" && val !== null) {
				if (seen.has(val)) {
					return "[Circular]";
				}
				seen.add(val);
			}
			return val;
		});
	}
}
