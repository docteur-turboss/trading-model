const PEM_LINE_PATTERN = /-----BEGIN[^-]+-----[\s\S]*?-----END[^-]+-----/g;

function _sanitizeError(err: Error): Record<string, unknown> {
	return {
		name: err.name,
		message: err.message,
		...(err.stack ? { stack: sanitizeForLog(err.stack) } : {}),
	};
}

function _sanitizeObject(value: Record<string, unknown>): Record<string, unknown> {
	const obj: Record<string, unknown> = {};
	for (const [key, val] of Object.entries(value)) {
		obj[key] = sanitizeForLog(val);
	}
	return obj;
}

export function sanitizeForLog(value: unknown): unknown {
	if (typeof value === "string") {
		return value.replace(PEM_LINE_PATTERN, "[REDACTED PEM]");
	}
	if (typeof value === "object" && value !== null) {
		if (value instanceof Error) return _sanitizeError(value);
		if (Array.isArray(value)) return value.map((item) => sanitizeForLog(item));
		return _sanitizeObject(value as Record<string, unknown>);
	}
	return value;
}
