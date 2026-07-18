import { beforeEach, describe, expect, it } from "@jest/globals";
import {
	TradingSymbol,
	UnixTimestamp,
} from "@trading-model/common/domain/primitives";
import {
	MarketType,
	SourceType,
} from "@trading-model/validation/contracts/market-data.types";

import {
	insertOrderBook,
	selectOrderBookBy,
} from "../../../../../src/infra/market-data/schema/order-book.schema";

const MAKE_BOOK = (overrides: Record<string, unknown> = {}) => ({
	symbol: "BTCUSDT",
	source: "binance",
	market: "crypto" as const,
	bids: [{ price: 50000, quantity: 0.5 }],
	asks: [{ price: 50010, quantity: 1.0 }],
	timestamp: new Date(),
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
		const baseTime = new Date();

		beforeEach(async () => {
			await insertOrderBook([MAKE_BOOK({ timestamp: baseTime }) as never]);
		});

		it("should find order books after a given timestamp", async () => {
			const results = await selectOrderBookBy.timestamp.after(
				UnixTimestamp.of(baseTime.getTime() - 3600000)
			);
			expect(results).not.toBeNull();
			expect(results!.length).toBeGreaterThanOrEqual(1);
		});

		it("should find order books before a given timestamp", async () => {
			const results = await selectOrderBookBy.timestamp.before(
				UnixTimestamp.of(baseTime.getTime() + 3600000)
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

	describe("empty data handling", () => {
		it("should do nothing when inserting empty array", async () => {
			await expect(insertOrderBook([])).resolves.toBeUndefined();
		});
	});
});
