export function invalidateCacheMap(
	store: Map<string, unknown>,
	pattern: string
): void {
	const regex = new RegExp(
		pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\*/g, ".*")
	);
	for (const key of store.keys()) {
		if (regex.test(key)) {
			store.delete(key);
		}
	}
}
