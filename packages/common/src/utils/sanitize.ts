import type { JsonObject } from "@trading-model/primitives/primitives";
import { errorProp } from "./errors/base";

const PEM_LINE_PATTERN = /-----BEGIN[^-]+-----[\s\S]*?-----END[^-]+-----/g;
const Visited = new WeakSet<object>();

function _sanitizeError(err: Error): JsonObject {
	const code = errorProp(err, "code");
	const cause = errorProp(err, "cause");
	return {
		name: err.name,
		message: err.message,
		...(typeof code === "string" || typeof code === "number" ? { code } : {}),
		...(err.stack ? { stack: sanitizeForLog(err.stack) } : {}),
		// Wrapped errors (createAppError({ cause })) carry the root cause here.
		...(cause === undefined
			? {}
			: { cause: sanitizeForLog(cause) as JsonObject }),
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
	if (typeof value === "object" && value !== null) {
		if (Visited.has(value)) {
			return "[Circular]";
		}
		Visited.add(value);
		try {
			if (value instanceof Error) {
				return _sanitizeError(value);
			}
			if (Array.isArray(value)) {
				return value.map((item) => sanitizeForLog(item));
			}
			return _sanitizeObject(value as JsonObject);
		} finally {
			Visited.delete(value);
		}
	}
	if (typeof value === "string") {
		return value.replace(PEM_LINE_PATTERN, "[REDACTED PEM]");
	}
	return value;
}
