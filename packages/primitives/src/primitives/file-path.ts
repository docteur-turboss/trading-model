export type FilePath = string & { readonly brand: "FilePath" };

export function toFilePath(value: string): FilePath {
	return FilePath.of(value);
}

export function fromFilePath(value: FilePath): string {
	return value;
}

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
