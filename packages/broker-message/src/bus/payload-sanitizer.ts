const MONGODB_OPERATORS = new Set([
	"$where",
	"$regex",
	"$options",
	"$function",
	"$accumulator",
	"$ne",
	"$eq",
	"$gt",
	"$gte",
	"$lt",
	"$lte",
	"$in",
	"$nin",
	"$exists",
	"$expr",
	"$and",
	"$or",
	"$nor",
	"$not",
]);

const MAX_DEPTH = 10;

export function sanitizePayload(value: unknown, depth = 0): unknown {
	if (depth >= MAX_DEPTH) {
		throw new Error("Payload exceeds maximum nesting depth");
	}

	if (Array.isArray(value)) {
		return sanitizeArray(value, depth);
	}

	if (typeof value === "object" && value !== null) {
		return sanitizeObject(value as Record<string, unknown>, depth);
	}

	return value;
}

function sanitizeArray(value: unknown[], depth: number): unknown[] {
	return value.map((item) => sanitizePayload(item, depth + 1));
}

function sanitizeObject(
	value: Record<string, unknown>,
	depth: number
): Record<string, unknown> {
	const sanitized: Record<string, unknown> = {};
	for (const [key, val] of Object.entries(value)) {
		if (key.startsWith("$") && MONGODB_OPERATORS.has(key)) {
			throw new Error(`Blocked operator in payload key: ${key}`);
		}
		sanitized[key] = sanitizePayload(val, depth + 1);
	}
	return sanitized;
}
