export type LoadAvg = number & { readonly brand: "LoadAvg" };

export const LoadAvg = {
	of(value: number): LoadAvg {
		return value as LoadAvg;
	},
};
