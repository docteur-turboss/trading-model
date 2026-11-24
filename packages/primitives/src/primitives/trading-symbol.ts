import { createStringBrand } from "./branded-utils";

export type TradingSymbol = string & { readonly brand: "TradingSymbol" };

export const TradingSymbol =
	createStringBrand<"TradingSymbol">("TradingSymbol");
