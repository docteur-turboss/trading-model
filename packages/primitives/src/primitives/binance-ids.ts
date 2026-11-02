export type BinanceFromId = string & { readonly brand: "BinanceFromId" };
export const BinanceFromId = {
	of(value: string): BinanceFromId {
		if (value.length === 0) {
			throw new RangeError(
				`BinanceFromId must be a non-empty string, got ${JSON.stringify(value)}`
			);
		}
		return value as BinanceFromId;
	},
};
