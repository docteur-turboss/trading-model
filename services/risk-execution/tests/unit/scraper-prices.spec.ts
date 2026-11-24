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
const candle = (close: number, closeTimestamp: string) => ({
	close,
	closeTimestamp,
});

it("prices each symbol at its last closed candle, never at a candle still open", async () => {
	get.mockImplementation(async (url: string) =>
		url.includes("/BTCUSDT?")
			? {
					rows: [
						candle(60_000, "2026-11-20T09:58:59.999Z"),
						candle(60_100, "2026-11-20T09:59:59.999Z"),
						candle(60_200, "2026-11-20T10:00:59.999Z"), // still open
					],
				}
			: { rows: [] }
	);
	const prices = await new ScraperPrices({} as never, () => NOW).latest([
		"BTCUSDT",
		"ETHUSDT",
	]);
	expect(prices).toEqual({
		BTCUSDT: { price: 60_100, at: Date.parse("2026-11-20T09:59:59.999Z") },
	});
	expect(get.mock.calls[0][0]).toContain(
		"/v2/candles/symbols/BTCUSDT?from=2026-11-20T09:45:30.000Z"
	);
});
