export type FilePath = string & { readonly brand: "FilePath" };

export const FilePath = {
	of(value: string): FilePath {
		if (typeof value !== "string" || value.length === 0) {
			throw new RangeError(
				`FilePath must be a non-empty string, got ${JSON.stringify(value)}`
			);
		}
		return value as FilePath;
	},
};
