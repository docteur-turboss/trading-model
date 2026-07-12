import { beforeEach, describe, expect, it } from "@jest/globals";
import {
	TradingSymbol,
	UnixTimestamp,
} from "@trading-model/common/domain/primitives";
import type { SourceType } from "@trading-model/validation/contracts/market-data.types";
import {
	insertOrderBook,
	selectOrderBookBy,
} from "../../src/infra/market-data/schema/order-book.schema";

const BUILD_ORDER_BOOK = (symbol: string, ts: Date) => ({
	symbol,
	source: "binance",
	market: "crypto" as const,
	bids: [
		{ price: 50000, quantity: 0.5 },
		{ price: 49990, quantity: 1.0 },
	],
	asks: [
		{ price: 50010, quantity: 1.0 },
		{ price: 50020, quantity: 0.8 },
	],
	timestamp: ts,
});

const BUILD_ORDER_BOOK_ALT_SOURCE = (symbol: string, ts: Date) => ({
	symbol,
	source: "kraken",
	market: "crypto" as const,
	bids: [{ price: 50005, quantity: 0.3 }],
	asks: [{ price: 50015, quantity: 0.7 }],
	timestamp: ts,
});

describe("OrderBook storage — full insert/query integration", () => {
	const t1 = new Date(Date.now());
	const t2 = new Date(t1.getTime() + 3600000);
	const t3 = new Date(t1.getTime() + 7200000);

	beforeEach(async () => {
		await insertOrderBook([BUILD_ORDER_BOOK("BTCUSDT", t1) as never]);
		await insertOrderBook([BUILD_ORDER_BOOK("BTCUSDT", t2) as never]);
		await insertOrderBook([BUILD_ORDER_BOOK("ETHUSDT", t3) as never]);
		await insertOrderBook([
			BUILD_ORDER_BOOK_ALT_SOURCE("BTCUSDT", t1) as never,
		]);
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
		const after = await selectOrderBookBy.timestamp.after(
			UnixTimestamp.of(t1.getTime())
		);
		expect(after).not.toBeNull();
		expect(after!.length).toBeGreaterThanOrEqual(1);

		for (const entry of after!) {
			expect(new Date(entry!.timestamp).getTime()).toBeGreaterThan(
				t1.getTime()
			);
		}
	});

	it("should query entries before a given timestamp", async () => {
		const before = await selectOrderBookBy.timestamp.before(
			UnixTimestamp.of(t3.getTime())
		);
		expect(before).not.toBeNull();
		expect(before!.length).toBeGreaterThanOrEqual(1);
	});

	it("should return results sorted by timestamp ascending for after query", async () => {
		const after = await selectOrderBookBy.timestamp.after(
			UnixTimestamp.of(t1.getTime() - 3600000)
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
