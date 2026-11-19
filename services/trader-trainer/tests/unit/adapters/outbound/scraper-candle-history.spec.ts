import { describe, expect, it, jest } from "@jest/globals";
import { TradingSymbol } from "@trading-model/primitives/primitives";

const get = jest.fn<(...args: any[]) => any>();
jest.mock("@trading-model/http/http-client", () => ({
	HttpClient: { createWithTls: () => ({ get }) },
}));

import { ScraperCandleHistory } from "../../../../src/adapters/outbound/scraper-candle-history";

const BTC = TradingSymbol.of("BTCUSDT");
const AT = Date.parse("2026-01-01T01:00:00.000Z");
const row = (open: string, close: string, interval = "1m") => ({
	source: "binance",
	market: "crypto",
	interval,
	open: 1,
	high: 2,
	low: 1,
	close: 1,
	volume: 1,
	timestamp: open,
	closeTimestamp: close,
});

describe("ScraperCandleHistory", () => {
	const history = new ScraperCandleHistory(
		{} as never,
		async () =>
			({
				host: "scraper",
				port: 3000,
			}) as never
	);

	it("pages, keeps closed 1m candles once, bounded by the instant", async () => {
		get
			.mockResolvedValueOnce({
				rows: [
					row("2026-01-01T00:00:00.000Z", "2026-01-01T00:00:59.999Z"),
					row("2026-01-01T00:00:00.000Z", "2026-01-01T00:00:59.999Z"),
					row("2026-01-01T00:01:00.000Z", "2026-01-01T00:01:59.999Z", "1h"),
				],
				nextCursor: "c1",
			})
			.mockResolvedValueOnce({
				rows: [
					row("2026-01-01T00:59:00.000Z", "2026-01-01T00:59:59.999Z"),
					row("2026-01-01T01:00:00.000Z", "2026-01-01T01:00:59.999Z"),
				],
				nextCursor: null,
			});

		const candles = await history.loadWindow(BTC, AT, 100);

		expect(candles.map((c) => c.timestamp)).toEqual([
			Date.parse("2026-01-01T00:00:00.000Z"),
			Date.parse("2026-01-01T00:59:00.000Z"),
		]);
		expect(get.mock.calls[1][0]).toContain("&after=c1");
		expect(get.mock.calls[0][0]).toContain(`to=${new Date(AT).toISOString()}`);
	});

	it("rejects a page holding a negative price", async () => {
		get.mockImplementationOnce(async (_u, _h, schema) =>
			schema.parse({
				rows: [
					{
						...row("2026-01-01T00:00:00.000Z", "2026-01-01T00:00:59.999Z"),
						open: -1,
					},
				],
				nextCursor: null,
			})
		);

		await expect(history.loadWindow(BTC, AT, 100)).rejects.toThrow();
	});
});
