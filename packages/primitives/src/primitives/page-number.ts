export type PageNumber = number & { readonly brand: "PageNumber" };

export const PageNumber = {
	of(value: number): PageNumber {
		const num = Math.max(1, Math.round(value));
		return num as PageNumber;
	},
};

export type Limit = number & { readonly brand: "Limit" };

export const Limit = {
	of(value: number, maxLimit: number): Limit {
		return Math.min(maxLimit, Math.max(1, Math.round(value))) as Limit;
	},
};
