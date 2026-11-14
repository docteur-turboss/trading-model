import { createEnumValues } from "../enum-utils";

export enum MarketType {
	Crypto = "crypto",
	Equity = "equity",
	Bond = "bond",
	Etf = "etf",
	Fx = "fx",
	Future = "future",
}

export namespace MarketType {
	export const values: () => MarketType[] = createEnumValues(MarketType);
}

export enum SourceType {
	Bloomberg = "bloomberg",
	Binance = "binance",
	Nyse = "nyse",
}

export namespace SourceType {
	export const values: () => SourceType[] = createEnumValues(SourceType);
}

export enum CandleInterval {
	S1 = "1s",
	Min1 = "1m",
	Min3 = "3m",
	Min5 = "5m",
	Min15 = "15m",
	Min30 = "30m",
	H1 = "1h",
	H2 = "2h",
	H4 = "4h",
	H6 = "6h",
	H8 = "8h",
	H12 = "12h",
	D1 = "1d",
	D3 = "3d",
	W1 = "1w",
	Month1 = "1M",
}

export namespace CandleInterval {
	export const values: () => CandleInterval[] =
		createEnumValues(CandleInterval);
}

export enum TradeSide {
	Buy = "buy",
	Sell = "sell",
}

export namespace TradeSide {
	export const values: () => TradeSide[] = createEnumValues(TradeSide);
}
