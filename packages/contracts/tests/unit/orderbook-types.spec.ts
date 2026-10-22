import { describe, expect, it } from "@jest/globals";
import {
	Price,
	toSymbol,
	UnixTimestamp,
	Volume,
} from "@trading-model/primitives/primitives";
import { MarketType, SourceType } from "../../src/market-data/enums";
import type {
	OrderBookData,
	OrderBookLevel,
} from "../../src/market-data/orderbook.types";
import {
	getAskTotalQty,
	getAvgAsk,
	getAvgBid,
	getBidTotalQty,
} from "../../src/market-data.types";

function level(price: number, quantity: number): OrderBookLevel {
	return { price: Price.of(price), quantity: Volume.of(quantity) };
}

function orderBook(
	bids: OrderBookLevel[],
	asks: OrderBookLevel[]
): OrderBookData {
	return {
		symbol: toSymbol("BTCUSDT"),
		source: SourceType.Binance,
		timestamp: UnixTimestamp.of(1_700_000_000),
		market: MarketType.Crypto,
		bids: new Set(bids),
		asks: new Set(asks),
	};
}

describe("orderbook helpers", () => {
	it("computes the volume-weighted average bid", () => {
		const book = orderBook([level(100, 2), level(200, 2)], []);
		expect(getAvgBid(book)).toBe(150);
	});

	it("computes the volume-weighted average ask", () => {
		const book = orderBook([], [level(300, 1), level(400, 3)]);
		expect(getAvgAsk(book)).toBe(375);
	});

	it("returns 0 for an empty side", () => {
		const book = orderBook([], []);
		expect(getAvgBid(book)).toBe(0);
		expect(getAvgAsk(book)).toBe(0);
	});

	it("totals the quantities per side", () => {
		const book = orderBook([level(100, 2), level(101, 3)], [level(200, 5)]);
		expect(getBidTotalQty(book)).toBe(5);
		expect(getAskTotalQty(book)).toBe(5);
	});
});
