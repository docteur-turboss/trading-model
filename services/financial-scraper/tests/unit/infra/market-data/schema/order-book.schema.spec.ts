import { beforeEach, describe, expect, it } from "@jest/globals";
import {
	MarketType,
	SourceType,
} from "@trading-model/contracts/market-data.types";
import {
	TradingSymbol,
	UnixTimestamp,
} from "@trading-model/primitives/primitives";

import {
	insertOrderBook,
	MAX_ORDER_BOOKS_PER_SYMBOL,
	selectOrderBookBy,
} from "../../../../../src/adapters/outbound/persistence/schema/order-book.schema";

// OrderBookData as produced by the Binance normalizer: Set levels, Unix timestamp.
const MAKE_BOOK = (overrides: Record<string, unknown> = {}) => ({
	symbol: "BTCUSDT",
	source: "binance",
	market: "crypto" as const,
	bids: new Set([{ price: 50000, quantity: 0.5 }]),
	asks: new Set([{ price: 50010, quantity: 1.0 }]),
	timestamp: Date.now(),
	...overrides,
});

const BTC = TradingSymbol.of("BTCUSDT");
const DOGE = TradingSymbol.of("DOGEUSDT");

describe("MarkerOrderBooks (in-memory storage)", () => {
	describe("insert and query by symbol", () => {
		beforeEach(async () => {
			await insertOrderBook([MAKE_BOOK() as never]);
		});

		it("should insert an order book and retrieve it via symbol", async () => {
			const results = await selectOrderBookBy.symbol(BTC);
			expect(results).not.toBeNull();
			expect(results!.length).toBe(1);
		});

		it("should return null for unknown symbol", async () => {
			const results = await selectOrderBookBy.symbol(DOGE);
			expect(results).toBeNull();
		});
	});

	describe("query by source", () => {
		beforeEach(async () => {
			await insertOrderBook([MAKE_BOOK() as never]);
		});

		it("should find order books by source", async () => {
			const results = await selectOrderBookBy.source(SourceType.Binance);
			expect(results).not.toBeNull();
			expect(results!.length).toBeGreaterThanOrEqual(1);
		});

		it("should return null for unknown source", async () => {
			const results = await selectOrderBookBy.source("kraken" as SourceType);
			expect(results).toBeNull();
		});
	});

	describe("timestamp range queries", () => {
		const baseTime = Date.now();

		beforeEach(async () => {
			await insertOrderBook([MAKE_BOOK({ timestamp: baseTime }) as never]);
		});

		it("should find order books after a given timestamp", async () => {
			const results = await selectOrderBookBy.timestamp.after(
				UnixTimestamp.of(baseTime - 3600000)
			);
			expect(results).not.toBeNull();
			expect(results!.length).toBeGreaterThanOrEqual(1);
		});

		it("should find order books before a given timestamp", async () => {
			const results = await selectOrderBookBy.timestamp.before(
				UnixTimestamp.of(baseTime + 3600000)
			);
			expect(results).not.toBeNull();
			expect(results!.length).toBeGreaterThanOrEqual(1);
		});
	});

	describe("validation failure", () => {
		it("should throw on invalid data", async () => {
			const invalid = MAKE_BOOK({ market: "invalid" as never });
			await expect(insertOrderBook([invalid as never])).rejects.toThrow();
		});

		it("should reject levels sent as arrays instead of Sets", async () => {
			const arrays = MAKE_BOOK({ bids: [{ price: 50000, quantity: 0.5 }] });
			await expect(insertOrderBook([arrays as never])).rejects.toThrow();
		});
	});

	describe("getById and getByMarket", () => {
		beforeEach(async () => {
			await insertOrderBook([
				MAKE_BOOK({ symbol: "BTCUSDT", market: "crypto" }) as never,
			]);
		});

		it("should retrieve by id", async () => {
			const marketData = await selectOrderBookBy.market(MarketType.Crypto);
			expect(marketData).not.toBeNull();

			let found = false;
			for (let id = 10000; id < 10050; id++) {
				const result = await selectOrderBookBy.id(id);
				if (result && result.symbol === "BTCUSDT") {
					found = true;
					break;
				}
			}
			expect(found).toBe(true);
		});

		it("should return null for unknown id", async () => {
			const result = await selectOrderBookBy.id(-1);
			expect(result).toBeNull();
		});

		it("should retrieve by market", async () => {
			const results = await selectOrderBookBy.market(MarketType.Crypto);
			expect(results).not.toBeNull();
			expect(results!.length).toBeGreaterThanOrEqual(1);
		});

		it("should return null for unknown market", async () => {
			const results = await selectOrderBookBy.market(MarketType.Fx);
			expect(results).toBeNull();
		});
	});

	describe("per-symbol bound (issue #554)", () => {
		it("evicts the oldest snapshots of a symbol from storage and every index", async () => {
			const symbol = TradingSymbol.of("BOUNDUSDT");
			const base = 1_000_000;
			const books = Array.from(
				{ length: MAX_ORDER_BOOKS_PER_SYMBOL + 5 },
				(_, offset) =>
					MAKE_BOOK({
						symbol: "BOUNDUSDT",
						source: "bound-source",
						timestamp: base + offset,
					}) as never
			);
			await insertOrderBook(books.slice(0, 10));
			await insertOrderBook(books.slice(10));

			const kept = await selectOrderBookBy.symbol(symbol);
			expect(kept).toHaveLength(MAX_ORDER_BOOKS_PER_SYMBOL);
			expect(kept![0]!.timestamp).toBe(base + 5);
			expect(
				await selectOrderBookBy.source("bound-source" as SourceType)
			).toHaveLength(MAX_ORDER_BOOKS_PER_SYMBOL);
			const early = await selectOrderBookBy.timestamp.before(
				UnixTimestamp.of(base + 5)
			);
			expect(early).toHaveLength(0);
		});

		it("does not evict the snapshots of another symbol", async () => {
			const other = TradingSymbol.of("KEEPUSDT");
			await insertOrderBook([MAKE_BOOK({ symbol: "KEEPUSDT" }) as never]);
			await insertOrderBook(
				Array.from(
					{ length: MAX_ORDER_BOOKS_PER_SYMBOL + 1 },
					() => MAKE_BOOK({ symbol: "FLOODUSDT" }) as never
				)
			);
			expect(await selectOrderBookBy.symbol(other)).toHaveLength(1);
		});
	});

	describe("empty data handling", () => {
		it("should do nothing when inserting empty array", async () => {
			await expect(insertOrderBook([])).resolves.toBeUndefined();
		});
	});
});
