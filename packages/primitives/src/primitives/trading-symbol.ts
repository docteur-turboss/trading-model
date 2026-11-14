import { createStringBrand } from "./branded-utils";

export type TradingSymbol = string & { readonly brand: "TradingSymbol" };

export function toSymbol(_symbol: string): TradingSymbol {
	return TradingSymbol.of(_symbol);
}

export function fromSymbol(_symbol: TradingSymbol): string {
	return _symbol;
}

export const TradingSymbol =
	createStringBrand<"TradingSymbol">("TradingSymbol");
