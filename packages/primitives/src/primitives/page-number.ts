export type PageNumber = number & { readonly brand: "PageNumber" };

export function toPageNumber(value: number): PageNumber {
	return PageNumber.of(value);
}

export function fromPageNumber(value: PageNumber): number {
	return value;
}

export const PageNumber = {
	of(value: number): PageNumber {
		const num = Math.max(1, Math.round(value));
		return num as PageNumber;
	},
};

export type Limit = number & { readonly brand: "Limit" };

export function toLimit(value: number, maxLimit: number): Limit {
	return Limit.of(value, maxLimit);
}

export function fromLimit(value: Limit): number {
	return value;
}

export const Limit = {
	of(value: number, maxLimit: number): Limit {
		return Math.min(maxLimit, Math.max(1, Math.round(value))) as Limit;
	},
};
