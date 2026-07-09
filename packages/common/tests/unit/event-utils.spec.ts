import { describe, expect, it } from "@jest/globals";
import {
	type CandleData,
	CandleInterval,
	getAskTotalQty,
	getAvgAsk,
	getAvgBid,
	getBidTotalQty,
	MarketType,
	type OrderBookData,
	type OrderBookLevel,
	SourceType,
	type TradeData,
	TradeSide,
} from "../../src/config/event.types";
import {
	getCandleBodySize,
	getMidPrice,
	getSpread,
	isBullish,
	isBuyTrade,
	isSellTrade,
} from "../../src/config/event-utils";
import {
	Price,
	type TradingSymbol,
	UnixTimestamp,
	Volume,
} from "../../src/domain/primitives";

function makeOb(bids: OrderBookLevel[], asks: OrderBookLevel[]): OrderBookData {
	return {
		bids: new Set(bids),
		asks: new Set(asks),
		symbol: "BTCUSDT" as unknown as TradingSymbol,
		source: SourceType.Binance,
		market: MarketType.Crypto,
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
		symbol: "BTCUSDT" as unknown as TradingSymbol,
		source: SourceType.Binance,
		market: MarketType.Crypto,
		interval: CandleInterval.Min1,
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
		symbol: "BTCUSDT" as unknown as TradingSymbol,
		source: SourceType.Binance,
		market: MarketType.Crypto,
		tradeId: 1n,
	};
}

describe("event-utils", () => {
	describe("getAvgBid", () => {
		it("should compute average bid price", () => {
			const ob = makeOb(
				[
					{ price: Price.of(100), quantity: Volume.of(1) },
					{ price: Price.of(200), quantity: Volume.of(1) },
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
					{ price: Price.of(101), quantity: Volume.of(1) },
					{ price: Price.of(201), quantity: Volume.of(1) },
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
				[{ price: Price.of(100), quantity: Volume.of(1) }],
				[{ price: Price.of(110), quantity: Volume.of(1) }]
			);
			expect(getSpread(ob)).toBe(10);
		});
	});

	describe("getMidPrice", () => {
		it("should compute mid price as (bid + ask) / 2", () => {
			const ob = makeOb(
				[{ price: Price.of(100), quantity: Volume.of(1) }],
				[{ price: Price.of(110), quantity: Volume.of(1) }]
			);
			expect(getMidPrice(ob)).toBe(105);
		});
	});

	describe("getBidTotalQty", () => {
		it("should sum all bid quantities", () => {
			const ob = makeOb(
				[
					{ price: Price.of(100), quantity: Volume.of(0.5) },
					{ price: Price.of(101), quantity: Volume.of(1.5) },
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
					{ price: Price.of(110), quantity: Volume.of(2) },
					{ price: Price.of(111), quantity: Volume.of(3) },
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
			expect(isBuyTrade(makeTrade(TradeSide.Buy))).toBe(true);
		});

		it("should return false for sell trades", () => {
			expect(isBuyTrade(makeTrade(TradeSide.Sell))).toBe(false);
		});
	});

	describe("isSellTrade", () => {
		it("should return true for sell trades", () => {
			expect(isSellTrade(makeTrade(TradeSide.Sell))).toBe(true);
		});

		it("should return false for buy trades", () => {
			expect(isSellTrade(makeTrade(TradeSide.Buy))).toBe(false);
		});
	});
});
