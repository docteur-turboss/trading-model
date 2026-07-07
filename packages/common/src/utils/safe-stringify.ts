type ReplacerFn = (key: string, val: unknown) => unknown;

function _createReplacer(customReplacer?: ReplacerFn): ReplacerFn {
	const seen = new WeakSet<object>();
	return (key: string, val: unknown) => {
		const transformed = customReplacer ? customReplacer(key, val) : val;
		if (typeof transformed === "bigint") {
			return transformed.toString();
		}
		if (typeof transformed === "object" && transformed !== null) {
			if (seen.has(transformed)) {
				return "[Circular]";
			}
			seen.add(transformed);
		}
		return transformed;
	};
}

export function safeStringify(value: unknown, space?: number, customReplacer?: ReplacerFn): string {
	return JSON.stringify(value, _createReplacer(customReplacer), space);
}
