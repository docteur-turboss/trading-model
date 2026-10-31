import { beforeEach, describe, expect, it } from "@jest/globals";
import {
	MarketType,
	type SourceType,
} from "@trading-model/contracts/market-data.types";
import {
	Price,
	TradingSymbol,
	UnixTimestamp,
	Volume,
} from "@trading-model/primitives/primitives";
import {
	insertOrderBook,
	selectOrderBookBy,
} from "../../src/adapters/outbound/persistence/schema/order-book.schema";
import type { OrderBookData } from "../../src/domain/market-data.types";

// Same shape as the Binance normalizer output (OrderBookData): Set levels and
// a Unix timestamp. Arrays and Dates used to hide that the store rejected it.
const BUILD_ORDER_BOOK = (symbol: string, ts: number): OrderBookData => ({
	symbol: TradingSymbol.of(symbol),
	source: "binance" as SourceType,
	market: MarketType.Crypto,
	bids: new Set([
		{ price: Price.of(50000), quantity: Volume.of(0.5) },
		{ price: Price.of(49990), quantity: Volume.of(1.0) },
	]),
	asks: new Set([
		{ price: Price.of(50010), quantity: Volume.of(1.0) },
		{ price: Price.of(50020), quantity: Volume.of(0.8) },
	]),
	timestamp: UnixTimestamp.of(ts),
});

const BUILD_ORDER_BOOK_ALT_SOURCE = (
	symbol: string,
	ts: number
): OrderBookData => ({
	...BUILD_ORDER_BOOK(symbol, ts),
	source: "kraken" as SourceType,
	bids: new Set([{ price: Price.of(50005), quantity: Volume.of(0.3) }]),
	asks: new Set([{ price: Price.of(50015), quantity: Volume.of(0.7) }]),
});

describe("OrderBook storage â€” full insert/query integration", () => {
	const t1 = Date.now();
	const t2 = t1 + 3600000;
	const t3 = t1 + 7200000;

	beforeEach(async () => {
		await insertOrderBook([BUILD_ORDER_BOOK("BTCUSDT", t1)]);
		await insertOrderBook([BUILD_ORDER_BOOK("BTCUSDT", t2)]);
		await insertOrderBook([BUILD_ORDER_BOOK("ETHUSDT", t3)]);
		await insertOrderBook([BUILD_ORDER_BOOK_ALT_SOURCE("BTCUSDT", t1)]);
	});

	it("should query by symbol across multiple entries", async () => {
		const bySymbol = await selectOrderBookBy.symbol(
			TradingSymbol.of("BTCUSDT")
		);
		expect(bySymbol).not.toBeNull();

		for (const entry of bySymbol!) {
			expect(entry!.symbol).toBe("BTCUSDT");
		}
	});

	it("should query by source", async () => {
		const bySource = await selectOrderBookBy.source("kraken" as SourceType);
		expect(bySource).not.toBeNull();

		for (const entry of bySource!) {
			expect(entry!.source).toBe("kraken");
		}
	});

	it("should query entries after a given timestamp", async () => {
		const after = await selectOrderBookBy.timestamp.after(UnixTimestamp.of(t1));
		expect(after).not.toBeNull();
		expect(after!.length).toBeGreaterThanOrEqual(1);

		for (const entry of after!) {
			expect(new Date(entry!.timestamp).getTime()).toBeGreaterThan(t1);
		}
	});

	it("should query entries before a given timestamp", async () => {
		const before = await selectOrderBookBy.timestamp.before(
			UnixTimestamp.of(t3)
		);
		expect(before).not.toBeNull();
		expect(before!.length).toBeGreaterThanOrEqual(1);
	});

	it("should return results sorted by timestamp ascending for after query", async () => {
		const after = await selectOrderBookBy.timestamp.after(
			UnixTimestamp.of(t1 - 3600000)
		);
		for (let i = 1; i < after!.length; i++) {
			expect(new Date(after![i]!.timestamp).getTime()).toBeGreaterThanOrEqual(
				new Date(after![i - 1]!.timestamp).getTime()
			);
		}
	});

	it("should return null for non-existent symbol", async () => {
		const result = await selectOrderBookBy.symbol(
			TradingSymbol.of("NONEXISTENT")
		);
		expect(result).toBeNull();
	});

	it("should return null for non-existent source", async () => {
		const result = await selectOrderBookBy.source("coinbase" as SourceType);
		expect(result).toBeNull();
	});
});
