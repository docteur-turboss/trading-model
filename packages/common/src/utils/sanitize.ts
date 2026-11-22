import type { JsonObject } from "@trading-model/primitives/primitives";
import { errorProp } from "./errors/base";

/** Linear scan: a lazy regex is O(n²) on many BEGIN markers without END. */
function redactPem(text: string): string {
	let out = "";
	let pos = 0;
	let begin = text.indexOf("-----BEGIN");
	while (begin >= 0) {
		const end = text.indexOf("-----END", begin);
		const close = end < 0 ? -1 : text.indexOf("-----", end + 8);
		if (close < 0) {
			break;
		}
		out += `${text.slice(pos, begin)}[REDACTED PEM]`;
		pos = close + 5;
		begin = text.indexOf("-----BEGIN", pos);
	}
	return out + text.slice(pos);
}

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

/** Masks PEM in strings and flattens Errors; other values are returned as is (JSON.stringify recurses into them). */
export function sanitizeForLog(value: unknown): unknown {
	if (typeof value === "object" && value !== null) {
		if (Visited.has(value)) {
			return "[Circular]";
		}
		Visited.add(value);
		try {
			return value instanceof Error ? _sanitizeError(value) : value;
		} finally {
			Visited.delete(value);
		}
	}
	if (typeof value === "string") {
		return redactPem(value);
	}
	return value;
}
