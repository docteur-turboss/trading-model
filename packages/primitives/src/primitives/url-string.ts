export type URLString = string & { readonly brand: "URLString" };

export const URLString = {
	of(value: string): URLString {
		if (value.length === 0) {
			return value as URLString;
		}
		try {
			new URL(value);
			return value as URLString;
		} catch {
			throw new RangeError(`URLString must be a valid URL, got ${value}`);
		}
	},
};
