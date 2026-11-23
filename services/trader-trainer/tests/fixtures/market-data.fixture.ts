import type { CandleData } from "@trading-model/contracts/market-data.types";
import {
	CandleInterval,
	MarketType,
	SourceType,
} from "@trading-model/contracts/market-data.types";
import {
	Price,
	TradingSymbol,
	UnixTimestamp,
	Volume,
} from "@trading-model/primitives/primitives";

let seq = 0;

export function resetFixtureSeq(): void {
	seq = 0;
}

export function makeCandle(
	overrides: Partial<CandleData> & { symbol: string }
): CandleData {
	const t = Date.now() + seq++ * 60000;
	const open = overrides.open ?? 100;
	const close = overrides.close ?? 102;
	return {
		source: SourceType.Binance,
		timestamp: UnixTimestamp.of(t),
		market: MarketType.Crypto,
		open: Price.of(100),
		high: Price.of(Math.max(105, open, close)),
		low: Price.of(Math.min(95, open, close)),
		close: Price.of(102),
		volume: Volume.of(1000),
		interval: CandleInterval.Min1,
		closeTimestamp: UnixTimestamp.of(t + 60000),
		...overrides,
	};
}

export function feedCandles(
	buffer: {
		addCandle(symbol: TradingSymbol, candle: CandleData): void;
	},
	symbol: string,
	count: number,
	/** Price offset of bar `i`; default: rises by 1 every bar. */
	offset: (i: number) => number = (i) => i
): void {
	const sym = TradingSymbol.of(symbol);
	const now = Date.now();
	for (let i = 0; i < count; i++) {
		const p = offset(i);
		buffer.addCandle(
			sym,
			makeCandle({
				symbol: sym,
				open: Price.of(100 + p),
				high: Price.of(105 + p),
				low: Price.of(95 + p),
				close: Price.of(102 + p),
				volume: Volume.of(1000 + i * 10),
				timestamp: UnixTimestamp.of(now + i * 60000),
				closeTimestamp: UnixTimestamp.of(now + (i + 1) * 60000),
			})
		);
	}
}
