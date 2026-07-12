export type Bytes = number & { readonly brand: "Bytes" };

export const Bytes = {
	of(value: number): Bytes {
		return value as Bytes;
	},
};
