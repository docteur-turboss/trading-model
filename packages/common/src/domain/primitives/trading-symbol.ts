export type TradingSymbol = string & { readonly brand: "TradingSymbol" };

export function toSymbol(_symbol: string): TradingSymbol {
	return _symbol as TradingSymbol;
}

export function fromSymbol(_symbol: TradingSymbol): string {
	return _symbol;
}
