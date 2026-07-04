import { describe, expect, it } from "@jest/globals";
import type {
	CandleData,
	OrderBookData,
	TradeData,
} from "../../src/config/event.types";
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
		bids: new Set(bids),
		asks: new Set(asks),
		symbol: "BTCUSDT",
		source: "binance" as const,
		market: "crypto" as const,
		timestamp: Date.now(),
	};
}

function makeCandle(open: number, close: number): CandleData {
	return {
		open,
		close,
		high: Math.max(open, close),
		low: Math.min(open, close),
		volume: 1000,
		symbol: "BTCUSDT",
		source: "binance" as const,
		market: "crypto" as const,
		interval: "1m",
		timestamp: Date.now(),
		closeTimestamp: Date.now() + 60000,
	};
}

function makeTrade(side: "buy" | "sell"): TradeData {
	return {
		side,
		price: 50000,
		quantity: 0.1,
		timestamp: Date.now(),
		symbol: "BTCUSDT",
		source: "binance" as const,
		market: "crypto" as const,
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
			expect(isBuyTrade(makeTrade("buy"))).toBe(true);
		});

		it("should return false for sell trades", () => {
			expect(isBuyTrade(makeTrade("sell"))).toBe(false);
		});
	});

	describe("isSellTrade", () => {
		it("should return true for sell trades", () => {
			expect(isSellTrade(makeTrade("sell"))).toBe(true);
		});

		it("should return false for buy trades", () => {
			expect(isSellTrade(makeTrade("buy"))).toBe(false);
		});
	});
});
