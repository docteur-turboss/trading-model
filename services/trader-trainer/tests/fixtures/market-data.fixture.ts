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
	TradingSymbol,
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
		source: SourceType.Binance,
		timestamp: UnixTimestamp.of(t),
		market: MarketType.Crypto,
		open: Price.of(100),
		high: Price.of(105),
		low: Price.of(95),
		close: Price.of(102),
		volume: Volume.of(1000),
		interval: CandleInterval.Min1,
		closeTimestamp: UnixTimestamp.of(t + 60000),
		...overrides,
	};
}

export function makeTrade(
	symbol: string,
	side: TradeSide = TradeSide.Buy
): TradeData {
	return {
		symbol: TradingSymbol.of(symbol),
		source: SourceType.Binance,
		timestamp: UnixTimestamp.of(Date.now() + seq++ * 1000),
		market: MarketType.Crypto,
		price: Price.of(101),
		tradeId: BigInt(seq),
		quantity: Volume.of(10),
		side,
	};
}

export function makeOrderBook(symbol: string): OrderBookData {
	return {
		symbol: TradingSymbol.of(symbol),
		source: SourceType.Binance,
		timestamp: UnixTimestamp.of(Date.now()),
		market: MarketType.Crypto,
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
		symbol: TradingSymbol.of(symbol),
		source: SourceType.Binance,
		timestamp: UnixTimestamp.of(Date.now()),
		market: MarketType.Crypto,
		bids: new Set(),
		asks: new Set(),
	};
}

export function makeBookTicker(symbol: string): BookTickerData {
	return {
		symbol: TradingSymbol.of(symbol),
		source: SourceType.Binance,
		timestamp: UnixTimestamp.of(Date.now()),
		market: MarketType.Crypto,
		bidQty: Volume.of(10),
		askQty: Volume.of(15),
		bid: Price.of(100),
		ask: Price.of(102),
	};
}

export function makeBookTickerZeroBidAsk(symbol: string): BookTickerData {
	return {
		symbol: TradingSymbol.of(symbol),
		source: SourceType.Binance,
		timestamp: UnixTimestamp.of(Date.now()),
		market: MarketType.Crypto,
		bidQty: Volume.of(0),
		askQty: Volume.of(0),
		bid: Price.of(0),
		ask: Price.of(0),
	};
}

export function makeTicker24h(symbol: string): TickerData {
	return {
		symbol: TradingSymbol.of(symbol),
		source: SourceType.Binance,
		timestamp: UnixTimestamp.of(Date.now()),
		market: MarketType.Crypto,
		low: Price.of(90),
		open: Price.of(100),
		high: Price.of(110),
		last: Price.of(105),
		volume: Volume.of(50000),
		closeTimestamp: UnixTimestamp.of(Date.now()),
	};
}

export function feedCandles(
	buffer: {
		addData(dataType: string, symbol: TradingSymbol, data: CandleData): void;
	},
	symbol: string,
	count: number
): void {
	const sym = TradingSymbol.of(symbol);
	for (let i = 0; i < count; i++) {
		buffer.addData(
			"candle",
			sym,
			makeCandle({
				symbol: sym,
				open: Price.of(100 + i),
				high: Price.of(105 + i),
				low: Price.of(95 + i),
				close: Price.of(102 + i),
				volume: Volume.of(1000 + i * 10),
				timestamp: UnixTimestamp.of(Date.now() + i * 60000),
				closeTimestamp: UnixTimestamp.of(Date.now() + (i + 1) * 60000),
			})
		);
	}
}
