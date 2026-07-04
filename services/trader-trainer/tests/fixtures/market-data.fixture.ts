import type {
	BookTickerData,
	CandleData,
	OrderBookData,
	TickerData,
	TradeData,
} from "@trading-model/common/config/event.types";

let seq = 0;

export function resetFixtureSeq(): void {
	seq = 0;
}

export function makeCandle(
	overrides: Partial<CandleData> & { symbol: string }
): CandleData {
	const t = Date.now() + seq++ * 60000;
	return {
		source: "binance",
		timestamp: t,
		market: "crypto",
		open: 100,
		high: 105,
		low: 95,
		close: 102,
		volume: 1000,
		interval: "1m",
		closeTimestamp: t + 60000,
		...overrides,
	};
}

export function makeTrade(
	symbol: string,
	side: "buy" | "sell" = "buy"
): TradeData {
	return {
		symbol,
		source: "binance",
		timestamp: Date.now() + seq++ * 1000,
		market: "crypto",
		price: 101,
		tradeId: BigInt(seq),
		quantity: 10,
		side,
	};
}

export function makeOrderBook(symbol: string): OrderBookData {
	return {
		symbol,
		source: "binance",
		timestamp: Date.now(),
		market: "crypto",
		bids: new Set([
			{ price: 100, quantity: 10 },
			{ price: 99, quantity: 20 },
		]),
		asks: new Set([
			{ price: 102, quantity: 15 },
			{ price: 103, quantity: 5 },
		]),
	};
}

export function makeOrderBookEmpty(symbol: string): OrderBookData {
	return {
		symbol,
		source: "binance",
		timestamp: Date.now(),
		market: "crypto",
		bids: new Set(),
		asks: new Set(),
	};
}

export function makeBookTicker(symbol: string): BookTickerData {
	return {
		symbol,
		source: "binance",
		timestamp: Date.now(),
		market: "crypto",
		bidQty: 10,
		askQty: 15,
		bid: 100,
		ask: 102,
	};
}

export function makeBookTickerZeroBidAsk(symbol: string): BookTickerData {
	return {
		symbol,
		source: "binance",
		timestamp: Date.now(),
		market: "crypto",
		bidQty: 0,
		askQty: 0,
		bid: 0,
		ask: 0,
	};
}

export function makeTicker24h(symbol: string): TickerData {
	return {
		symbol,
		source: "binance",
		timestamp: Date.now(),
		market: "crypto",
		low: 90,
		open: 100,
		high: 110,
		last: 105,
		volume: 50000,
		closeTimestamp: Date.now(),
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
				open: 100 + i,
				high: 105 + i,
				low: 95 + i,
				close: 102 + i,
				volume: 1000 + i * 10,
				timestamp: Date.now() + i * 60000,
				closeTimestamp: Date.now() + (i + 1) * 60000,
			}),
		]);
	}
}
