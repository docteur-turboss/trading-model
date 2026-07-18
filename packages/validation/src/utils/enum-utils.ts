export function createEnumValues<Value extends string>(
	enumObj: Record<string, unknown>
): () => Value[] {
	const cache: Value[] = Object.values(enumObj).filter(
		(value): value is Value => typeof value === "string"
	);
	return () => Array.from(cache);
}
