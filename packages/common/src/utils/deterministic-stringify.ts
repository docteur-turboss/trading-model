import type { JsonObject } from "../domain/primitives";

/**
 * Deterministic JSON serialization for cryptographic signing.
 *
 * `JSON.stringify` does not guarantee property ordering across engines,
 * which makes it unsuitable for producing reproducible message digests.
 * This function recursively serializes an object with sorted keys so
 * that the same logical value always produces the same string, regardless
 * of the insertion order used to construct the object.
 *
 * - Primitives and arrays are serialised as usual.
 * - Object keys are sorted lexicographically (recursively).
 * - Prototype properties are ignored (only own enumerable keys).
 * - Cyclic references throw the standard TypeError.
 *
 * @param value - The value to serialize.
 * @returns A JSON string with deterministically ordered keys.
 */
export function deterministicStringify(value: unknown): string {
	return JSON.stringify(value, deterministicReplacer);
}

function deterministicReplacer(_key: string, value: unknown): unknown {
	if (typeof value === "object" && value !== null) {
		/* istanbul ignore next */ if (value instanceof Date) {
			return value.toISOString();
		}
		if (!Array.isArray(value)) {
			const keys = Object.keys(value).sort();
			const sorted: JsonObject = {};
			for (const key of keys) {
				sorted[key] = (value as JsonObject)[key];
			}
			return sorted;
		}
	}

	return value;
}
