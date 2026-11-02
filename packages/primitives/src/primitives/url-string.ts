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

	toURL(value: URLString): URL {
		return new URL(value);
	},

	isHTTPS(value: URLString): boolean {
		return URLString.toURL(value).protocol === "https:";
	},

	origin(value: URLString): string {
		return URLString.toURL(value).origin;
	},

	pathname(value: URLString): string {
		return URLString.toURL(value).pathname;
	},

	hostname(value: URLString): string {
		return URLString.toURL(value).hostname;
	},
};
