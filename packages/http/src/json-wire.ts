/**
 * JSON replacer of every HttpClient request body. Values JSON cannot carry: a
 * bigint is sent as a decimal string (64-bit trade ids) instead of throwing, a
 * Set as an array instead of an empty object.
 */
export function toJsonWire(_key: string, value: unknown): unknown {
	if (typeof value === "bigint") {
		return value.toString();
	}
	return value instanceof Set ? [...value] : value;
}
