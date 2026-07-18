import type { DurationMs } from "@trading-model/common/domain/primitives";
import { createEnumValues } from "../../utils/enum-utils";

export enum MarketType {
	Crypto = "crypto",
	Equity = "equity",
	Bond = "bond",
	Etf = "etf",
	Fx = "fx",
	Future = "future",
}

export namespace MarketType {
	export const values: () => MarketType[] =
		createEnumValues<MarketType>(MarketType);

	export function isDecentralized(value: MarketType): boolean {
		return value === MarketType.Crypto;
	}
}

export enum SourceType {
	Bloomberg = "bloomberg",
	Binance = "binance",
	Nyse = "nyse",
}

export namespace SourceType {
	export const values: () => SourceType[] =
		createEnumValues<SourceType>(SourceType);
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
		createEnumValues<CandleInterval>(CandleInterval);

	const IntervalToMsMap: Record<CandleInterval, DurationMs> = {
		"1s": 1000 as DurationMs,
		"1m": 60000 as DurationMs,
		"3m": 180000 as DurationMs,
		"5m": 300000 as DurationMs,
		"15m": 900000 as DurationMs,
		"30m": 1800000 as DurationMs,
		"1h": 3600000 as DurationMs,
		"2h": 7200000 as DurationMs,
		"4h": 14400000 as DurationMs,
		"6h": 21600000 as DurationMs,
		"8h": 28800000 as DurationMs,
		"12h": 43200000 as DurationMs,
		"1d": 86400000 as DurationMs,
		"3d": 259200000 as DurationMs,
		"1w": 604800000 as DurationMs,
		"1M": 2592000000 as DurationMs,
	};

	export function toMs(value: CandleInterval): number {
		return IntervalToMsMap[value];
	}
}

export enum TradeSide {
	Buy = "buy",
	Sell = "sell",
}

export namespace TradeSide {
	export const values: () => TradeSide[] =
		createEnumValues<TradeSide>(TradeSide);

	export function inverse(value: TradeSide): TradeSide {
		return value === TradeSide.Buy ? TradeSide.Sell : TradeSide.Buy;
	}
}
