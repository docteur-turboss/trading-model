import { describe, expect, it, jest } from "@jest/globals";
import { HttpClient } from "@trading-model/http/http-client";
import { ScraperClient } from "../../src/adapters/outbound/scraper-client";

jest.mock("../../src/config/address-manager", () => ({
	FIND_A_SERVICE: async () => ({ host: "scraper", port: 3000 }),
}));

const row = (close: number) => ({
	source: "binance",
	market: "crypto",
	interval: "1m",
	open: 1,
	high: 2,
	low: 1,
	close,
	volume: 1,
	timestamp: "2026-01-01T00:00:00.000Z",
	closeTimestamp: "2026-01-01T00:00:59.999Z",
});

function clientReturning(rows: unknown[]): ScraperClient {
	jest.spyOn(HttpClient, "createWithTls").mockReturnValue({
		get: async (_url: unknown, _opts: unknown, schema: any) =>
			schema.parse({ rows, nextCursor: null }),
	} as never);
	return new ScraperClient({} as never);
}

describe("ScraperClient.candles", () => {
	it("returns validated candles", async () => {
		const out = await clientReturning([row(2)]).candles(
			"BTCUSDT",
			0,
			1,
			60_000
		);
		expect(out).toHaveLength(1);
		expect(out[0].close).toBe(2);
	});

	it("rejects a page with an invalid price", async () => {
		await expect(
			clientReturning([row(-1)]).candles("BTCUSDT", 0, 1, 60_000)
		).rejects.toThrow();
	});
});
