import type { JsonObject } from "../domain/primitives";

const PEM_LINE_PATTERN = /-----BEGIN[^-]+-----[\s\S]*?-----END[^-]+-----/g;

function _sanitizeError(err: Error): JsonObject {
	return {
		name: err.name,
		message: err.message,
		...(err.stack ? { stack: sanitizeForLog(err.stack) } : {}),
	};
}

function _sanitizeObject(value: JsonObject): JsonObject {
	const obj: JsonObject = {};
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
		if (value instanceof Error) {
			return _sanitizeError(value);
		}
		if (Array.isArray(value)) {
			return value.map((item) => sanitizeForLog(item));
		}
		return _sanitizeObject(value as JsonObject);
	}
	return value;
}
