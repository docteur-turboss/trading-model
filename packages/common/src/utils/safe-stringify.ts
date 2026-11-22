type ReplacerFn = (key: string, val: unknown) => unknown;

function _createReplacer(customReplacer?: ReplacerFn): ReplacerFn {
	// Ancestor stack: a shared, non-circular reference is serialized each time.
	const ancestors: unknown[] = [];
	return function (this: unknown, key: string, val: unknown) {
		const transformed = customReplacer ? customReplacer(key, val) : val;
		if (typeof transformed === "bigint") {
			return transformed.toString();
		}
		if (typeof transformed === "object" && transformed !== null) {
			while (ancestors.length > 0 && ancestors[ancestors.length - 1] !== this) {
				ancestors.pop();
			}
			if (ancestors.includes(transformed)) {
				return "[Circular]";
			}
			ancestors.push(transformed);
		}
		return transformed;
	};
}

export function safeStringify(
	value: unknown,
	space?: number,
	customReplacer?: ReplacerFn
): string {
	return JSON.stringify(value, _createReplacer(customReplacer), space);
}
