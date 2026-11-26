import { describe, expect, it, jest } from "@jest/globals";
import type { HttpClient } from "@trading-model/http/http-client";
import { TradingSymbol } from "@trading-model/primitives/primitives";
import { fetchCandlePages } from "../../../src/signals/candle-pages";

const row = (timestamp: string) => ({
	source: "binance",
	market: "crypto",
	interval: "1m",
	open: 1,
	high: 2,
	low: 1,
	close: 2,
	volume: 3,
	timestamp,
	closeTimestamp: timestamp,
});
const SYMBOL = TradingSymbol.of("BTCUSDT");

const walk = async (get: jest.Mock<(...args: any[]) => any>) => {
	const out: number[] = [];
	for await (const c of fetchCandlePages(
		{ get } as unknown as HttpClient,
		"https://h/v2/candles/symbols/BTCUSDT?limit=1",
		SYMBOL
	)) {
		out.push(c.timestamp);
	}
	return out;
};

describe("fetchCandlePages", () => {
	it("follows nextCursor until null", async () => {
		const get = jest
			.fn<(...args: any[]) => any>()
			.mockResolvedValueOnce({
				rows: [row("2026-01-01T00:00:00.000Z")],
				nextCursor: "c1",
			})
			.mockResolvedValueOnce({
				rows: [row("2026-01-01T00:01:00.000Z")],
				nextCursor: null,
			});
		expect(await walk(get)).toEqual([
			Date.parse("2026-01-01T00:00:00.000Z"),
			Date.parse("2026-01-01T00:01:00.000Z"),
		]);
		expect(get.mock.calls[1][0]).toContain("&after=c1");
	});

	it("throws on an empty page", async () => {
		const get = jest.fn<(...args: any[]) => any>().mockResolvedValue(null);
		await expect(walk(get)).rejects.toThrow("Empty candle page for BTCUSDT");
	});
});
