import { describe, expect, it } from "@jest/globals";
import {
	type CandleData,
	CandleInterval,
	MarketType,
	type OrderBookData,
	SourceType,
	type TradeData,
	TradeSide,
} from "../../src/config/event.types";
import { Price, UnixTimestamp, Volume } from "../../src/domain/primitives";
import {
	getAskTotalQty,
	getAvgAsk,
	getAvgBid,
	getBidTotalQty,
	getCandleBodySize,
	getMidPrice,
	getSpread,
	isBullish,
	isBuyTrade,
	isSellTrade,
} from "../../src/config/event-utils";

function makeOb(
	bids: Array<{ price: number; quantity: number }>,
	asks: Array<{ price: number; quantity: number }>
): OrderBookData {
	return {
		bids: new Set(bids.map((b) => ({ price: Price.of(b.price), quantity: Volume.of(b.quantity) }))),
		asks: new Set(asks.map((a) => ({ price: Price.of(a.price), quantity: Volume.of(a.quantity) }))),
		symbol: "BTCUSDT",
		source: SourceType.BINANCE,
		market: MarketType.CRYPTO,
		timestamp: UnixTimestamp.now(),
	};
}

function makeCandle(open: number, close: number): CandleData {
	return {
		open: Price.of(open),
		close: Price.of(close),
		high: Price.of(Math.max(open, close)),
		low: Price.of(Math.min(open, close)),
		volume: Volume.of(1000),
		symbol: "BTCUSDT",
		source: SourceType.BINANCE,
		market: MarketType.CRYPTO,
		interval: CandleInterval.MIN1,
		timestamp: UnixTimestamp.now(),
		closeTimestamp: UnixTimestamp.of(Date.now() + 60000),
	};
}

function makeTrade(side: TradeSide): TradeData {
	return {
		side,
		price: Price.of(50000),
		quantity: Volume.of(0.1),
		timestamp: UnixTimestamp.now(),
		symbol: "BTCUSDT",
		source: SourceType.BINANCE,
		market: MarketType.CRYPTO,
		tradeId: 1n,
	};
}

describe("event-utils", () => {
	describe("getAvgBid", () => {
		it("should compute average bid price", () => {
			const ob = makeOb(
				[
					{ price: 100, quantity: 1 },
					{ price: 200, quantity: 1 },
				],
				[]
			);
			expect(getAvgBid(ob)).toBe(150);
		});

		it("should return 0 when no bids", () => {
			const ob = makeOb([], []);
			expect(getAvgBid(ob)).toBe(0);
		});
	});

	describe("getAvgAsk", () => {
		it("should compute average ask price", () => {
			const ob = makeOb(
				[],
				[
					{ price: 101, quantity: 1 },
					{ price: 201, quantity: 1 },
				]
			);
			expect(getAvgAsk(ob)).toBe(151);
		});

		it("should return 0 when no asks", () => {
			const ob = makeOb([], []);
			expect(getAvgAsk(ob)).toBe(0);
		});
	});

	describe("getSpread", () => {
		it("should compute spread as ask - bid", () => {
			const ob = makeOb(
				[{ price: 100, quantity: 1 }],
				[{ price: 110, quantity: 1 }]
			);
			expect(getSpread(ob)).toBe(10);
		});
	});

	describe("getMidPrice", () => {
		it("should compute mid price as (bid + ask) / 2", () => {
			const ob = makeOb(
				[{ price: 100, quantity: 1 }],
				[{ price: 110, quantity: 1 }]
			);
			expect(getMidPrice(ob)).toBe(105);
		});
	});

	describe("getBidTotalQty", () => {
		it("should sum all bid quantities", () => {
			const ob = makeOb(
				[
					{ price: 100, quantity: 0.5 },
					{ price: 101, quantity: 1.5 },
				],
				[]
			);
			expect(getBidTotalQty(ob)).toBe(2);
		});
	});

	describe("getAskTotalQty", () => {
		it("should sum all ask quantities", () => {
			const ob = makeOb(
				[],
				[
					{ price: 110, quantity: 2 },
					{ price: 111, quantity: 3 },
				]
			);
			expect(getAskTotalQty(ob)).toBe(5);
		});
	});

	describe("isBullish", () => {
		it("should return true when close >= open", () => {
			expect(isBullish(makeCandle(100, 105))).toBe(true);
		});

		it("should return true when close equals open", () => {
			expect(isBullish(makeCandle(100, 100))).toBe(true);
		});

		it("should return false when close < open", () => {
			expect(isBullish(makeCandle(100, 95))).toBe(false);
		});
	});

	describe("getCandleBodySize", () => {
		it("should compute absolute difference between close and open", () => {
			expect(getCandleBodySize(makeCandle(100, 110))).toBe(10);
			expect(getCandleBodySize(makeCandle(110, 100))).toBe(10);
		});
	});

	describe("isBuyTrade", () => {
		it("should return true for buy trades", () => {
			expect(isBuyTrade(makeTrade(TradeSide.BUY))).toBe(true);
		});

		it("should return false for sell trades", () => {
			expect(isBuyTrade(makeTrade(TradeSide.SELL))).toBe(false);
		});
	});

	describe("isSellTrade", () => {
		it("should return true for sell trades", () => {
			expect(isSellTrade(makeTrade(TradeSide.SELL))).toBe(true);
		});

		it("should return false for buy trades", () => {
			expect(isSellTrade(makeTrade(TradeSide.BUY))).toBe(false);
		});
	});
});
