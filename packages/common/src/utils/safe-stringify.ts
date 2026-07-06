function _createReplacer(): (key: string, val: unknown) => unknown {
	const seen = new WeakSet<object>();
	return (_key: string, val: unknown) => {
		if (typeof val === "bigint") {
			return val.toString();
		}
		if (typeof val === "object" && val !== null) {
			if (seen.has(val)) {
				return "[Circular]";
			}
			seen.add(val);
		}
		return val;
	};
}

export function safeStringify(value: unknown, space?: number): string {
	return JSON.stringify(value, _createReplacer(), space);
}
