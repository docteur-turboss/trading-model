import { expect, it, jest } from "@jest/globals";

const get = jest.fn<(...args: any[]) => any>();
jest.mock("@trading-model/http/http-client", () => ({
	HttpClient: { createWithTls: () => ({ get }) },
}));
jest.mock("../../src/config/address-manager", () => ({
	FIND_A_SERVICE: async () => ({ host: "scraper", port: 3000 }),
}));

import { ScraperPrices } from "../../src/adapters/outbound/scraper-prices";

const NOW = Date.parse("2026-11-20T10:00:30Z");

it("prices all symbols with one call, dropping a candle older than the halt threshold", async () => {
	get.mockResolvedValue({
		rows: [
			{
				symbol: "BTCUSDT",
				close: 60_100,
				closeTimestamp: "2026-11-20T09:59:59.999Z",
			},
			{
				symbol: "ETHUSDT",
				close: 3_000,
				closeTimestamp: "2026-11-19T09:59:59.999Z",
			},
		],
	});
	const prices = await new ScraperPrices({} as never, () => NOW).latest([
		"BTCUSDT",
		"ETHUSDT",
	]);
	expect(prices).toEqual({
		BTCUSDT: { price: 60_100, at: Date.parse("2026-11-20T09:59:59.999Z") },
	});
	expect(get).toHaveBeenCalledTimes(1);
	expect(get.mock.calls[0][0]).toContain(
		"/v2/candles/latest?symbols=BTCUSDT%2CETHUSDT"
	);
});
