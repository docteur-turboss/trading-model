import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
	MarketType,
	SourceType,
} from "@trading-model/contracts/market-data.types";
import {
	Price,
	TradingSymbol,
	UnixTimestamp,
	Volume,
} from "@trading-model/primitives/primitives";

const MOCK_QUERY = jest.fn<() => Promise<any>>().mockResolvedValue(undefined);

jest.mock("../../../../../src/config/db", () => ({
	DATABASE: { promise: jest.fn(() => ({ query: MOCK_QUERY })) },
}));

import { insertOrderBook } from "../../../../../src/adapters/outbound/persistence/schema/order-book.schema";

const AT = UnixTimestamp.of(Date.UTC(2026, 10, 7, 12));

describe("insertOrderBook (ADR-0053)", () => {
	beforeEach(() => {
		MOCK_QUERY.mockClear();
	});

	it("does not query MySQL for an empty batch", async () => {
		await insertOrderBook([]);

		expect(MOCK_QUERY).not.toHaveBeenCalled();
	});

	it("upserts one row per snapshot, levels as [price, quantity] pairs in order", async () => {
		await insertOrderBook([
			{
				symbol: TradingSymbol.of("BTCUSDT"),
				market: MarketType.Crypto,
				source: SourceType.Binance,
				timestamp: AT,
				bids: new Set([
					{ price: Price.of(100.5), quantity: Volume.of(2) },
					{ price: Price.of(100.25), quantity: Volume.of(1) },
				]),
				asks: new Set(),
			},
		]);

		const [sql, [rows]] = MOCK_QUERY.mock.calls[0] as unknown as [
			string,
			unknown[][][],
		];
		expect(sql).toContain("INSERT INTO market_order_books");
		expect(sql).toContain("ON DUPLICATE KEY UPDATE");
		expect(rows).toEqual([
			[
				"BTCUSDT",
				MarketType.Crypto,
				SourceType.Binance,
				new Date(AT),
				"[[100.5,2],[100.25,1]]",
				"[]",
			],
		]);
	});
});
