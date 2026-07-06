import type {
	BookTickerData,
	CandleData,
	OrderBookData,
	TickerData,
	TradeData,
} from "@trading-model/common/config/event.types";
import {
	CandleInterval,
	MarketType,
	SourceType,
	TradeSide,
} from "@trading-model/common/config/event.types";
import {
	Price,
	UnixTimestamp,
	Volume,
} from "@trading-model/common/domain/primitives";

let seq = 0;

export function resetFixtureSeq(): void {
	seq = 0;
}

export function makeCandle(
	overrides: Partial<CandleData> & { symbol: string }
): CandleData {
	const t = Date.now() + seq++ * 60000;
	return {
		source: SourceType.BINANCE,
		timestamp: UnixTimestamp.of(t),
		market: MarketType.CRYPTO,
		open: Price.of(100),
		high: Price.of(105),
		low: Price.of(95),
		close: Price.of(102),
		volume: Volume.of(1000),
		interval: CandleInterval.MIN1,
		closeTimestamp: UnixTimestamp.of(t + 60000),
		...overrides,
	};
}

export function makeTrade(
	symbol: string,
	side: TradeSide = TradeSide.BUY
): TradeData {
	return {
		symbol,
		source: SourceType.BINANCE,
		timestamp: UnixTimestamp.of(Date.now() + seq++ * 1000),
		market: MarketType.CRYPTO,
		price: Price.of(101),
		tradeId: BigInt(seq),
		quantity: Volume.of(10),
		side,
	};
}

export function makeOrderBook(symbol: string): OrderBookData {
	return {
		symbol,
		source: SourceType.BINANCE,
		timestamp: UnixTimestamp.of(Date.now()),
		market: MarketType.CRYPTO,
		bids: new Set([
			{ price: Price.of(100), quantity: Volume.of(10) },
			{ price: Price.of(99), quantity: Volume.of(20) },
		]),
		asks: new Set([
			{ price: Price.of(102), quantity: Volume.of(15) },
			{ price: Price.of(103), quantity: Volume.of(5) },
		]),
	};
}

export function makeOrderBookEmpty(symbol: string): OrderBookData {
	return {
		symbol,
		source: SourceType.BINANCE,
		timestamp: UnixTimestamp.of(Date.now()),
		market: MarketType.CRYPTO,
		bids: new Set(),
		asks: new Set(),
	};
}

export function makeBookTicker(symbol: string): BookTickerData {
	return {
		symbol,
		source: SourceType.BINANCE,
		timestamp: UnixTimestamp.of(Date.now()),
		market: MarketType.CRYPTO,
		bidQty: Volume.of(10),
		askQty: Volume.of(15),
		bid: Price.of(100),
		ask: Price.of(102),
	};
}

export function makeBookTickerZeroBidAsk(symbol: string): BookTickerData {
	return {
		symbol,
		source: SourceType.BINANCE,
		timestamp: UnixTimestamp.of(Date.now()),
		market: MarketType.CRYPTO,
		bidQty: Volume.of(0),
		askQty: Volume.of(0),
		bid: Price.of(0),
		ask: Price.of(0),
	};
}

export function makeTicker24h(symbol: string): TickerData {
	return {
		symbol,
		source: SourceType.BINANCE,
		timestamp: UnixTimestamp.of(Date.now()),
		market: MarketType.CRYPTO,
		low: Price.of(90),
		open: Price.of(100),
		high: Price.of(110),
		last: Price.of(105),
		volume: Volume.of(50000),
		closeTimestamp: UnixTimestamp.of(Date.now()),
	};
}

export function feedCandles(
	buffer: { addCandles(symbol: string, candles: CandleData[]): void },
	symbol: string,
	count: number
): void {
	for (let i = 0; i < count; i++) {
		buffer.addCandles(symbol, [
			makeCandle({
				symbol,
				open: Price.of(100 + i),
				high: Price.of(105 + i),
				low: Price.of(95 + i),
				close: Price.of(102 + i),
				volume: Volume.of(1000 + i * 10),
				timestamp: UnixTimestamp.of(Date.now() + i * 60000),
				closeTimestamp: UnixTimestamp.of(Date.now() + (i + 1) * 60000),
			}),
		]);
	}
}
