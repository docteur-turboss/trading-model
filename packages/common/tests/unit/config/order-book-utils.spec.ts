import { describe, expect, it } from "@jest/globals";
import {
	getAskTotalQty,
	getAvgAsk,
	getAvgBid,
	getBidTotalQty,
} from "../../../src/config/order-book-utils";
import type {
	OrderBookData,
	OrderBookLevel,
} from "../../../src/contracts/market-data";
import { MarketType, SourceType } from "../../../src/contracts/market-data";
import { Price, UnixTimestamp, Volume } from "../../../src/domain/primitives";
import { TradingSymbol } from "../../../src/domain/primitives/trading-symbol";

function level(price: number, quantity: number): OrderBookLevel {
	return { price: Price.of(price), quantity: Volume.of(quantity) };
}

function orderBook(
	bids: OrderBookLevel[],
	asks: OrderBookLevel[]
): OrderBookData {
	return {
		symbol: TradingSymbol.of("BTCUSDT"),
		source: SourceType.BinanceSpot,
		timestamp: UnixTimestamp.of(0),
		market: MarketType.Spot,
		bids: new Set(bids),
		asks: new Set(asks),
	};
}

describe("order-book-utils", () => {
	it("should compute average bid price", () => {
		const book = orderBook([level(100, 2), level(110, 3)], [level(120, 1)]);
		expect(getAvgBid(book)).toBeCloseTo(106, 5);
	});

	it("should compute average ask price", () => {
		const book = orderBook([level(100, 1)], [level(120, 2), level(130, 3)]);
		expect(getAvgAsk(book)).toBeCloseTo(126, 5);
	});

	it("should return zero average for empty levels", () => {
		const book = orderBook([], []);
		expect(getAvgBid(book)).toBe(0);
		expect(getAvgAsk(book)).toBe(0);
	});

	it("should sum bid and ask quantities", () => {
		const book = orderBook(
			[level(100, 2), level(110, 3)],
			[level(120, 4), level(130, 5)]
		);
		expect(Volume.toNumber(getBidTotalQty(book))).toBe(5);
		expect(Volume.toNumber(getAskTotalQty(book))).toBe(9);
	});

	it("should return zero total for empty levels", () => {
		const book = orderBook([], []);
		expect(Volume.toNumber(getBidTotalQty(book))).toBe(0);
		expect(Volume.toNumber(getAskTotalQty(book))).toBe(0);
	});
});
