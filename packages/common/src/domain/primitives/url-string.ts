export type URLString = string & { readonly brand: "URLString" };

export const URLString = {
	of(value: string): URLString {
		try {
			new URL(value);
			return value as URLString;
		} catch {
			throw new RangeError(`URLString must be a valid URL, got ${value}`);
		}
	},
};
