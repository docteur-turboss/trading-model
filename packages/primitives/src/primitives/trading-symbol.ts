export type TradingSymbol = string & { readonly brand: "TradingSymbol" };

export function toSymbol(_symbol: string): TradingSymbol {
	return TradingSymbol.of(_symbol);
}

export function fromSymbol(_symbol: TradingSymbol): string {
	return _symbol;
}

export const TradingSymbol = {
	of(value: string): TradingSymbol {
		if (typeof value !== "string" || value.length === 0) {
			throw new RangeError(
				`TradingSymbol must be a non-empty string, got ${JSON.stringify(value)}`
			);
		}
		return value as TradingSymbol;
	},
};
