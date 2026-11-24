import { expect, it, jest } from "@jest/globals";

const get = jest.fn<(...args: any[]) => any>();
jest.mock("@trading-model/http/http-client", () => ({
	HttpClient: { createWithTls: () => ({ get }) },
}));
jest.mock("../../src/config/address-manager", () => ({
	FIND_A_SERVICE: async () => ({ host: "scraper", port: 3000 }),
}));

import { HTTP_STATUS } from "@trading-model/contracts/http-status";
import {
	createHttpClientError,
	createHttpClientTimeoutError,
} from "@trading-model/http/http-client-errors";
import { ScraperPrices } from "../../src/adapters/outbound/scraper-prices";
import { RiskLimits } from "../../src/domain/limits";

const NOW = Date.parse("2026-11-20T10:00:30Z");

it("prices all symbols with one call, dropping a candle older than the halt threshold or ahead of the clock", async () => {
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
			{
				symbol: "SOLUSDT",
				close: 150,
				closeTimestamp: "2026-11-20T10:00:59.999Z", // ahead of this clock
			},
		],
	});
	const prices = await new ScraperPrices({} as never, () => NOW).latest([
		"BTCUSDT",
		"ETHUSDT",
		"SOLUSDT",
	]);
	expect(prices).toEqual({
		BTCUSDT: { price: 60_100, at: Date.parse("2026-11-20T09:59:59.999Z") },
	});
	expect(get).toHaveBeenCalledTimes(1);
	expect(get.mock.calls[0][0]).toContain(
		"/v2/candles/latest?symbols=BTCUSDT%2CETHUSDT%2CSOLUSDT"
	);
});

it("falls back to one call per symbol when financial-scraper N-1 answers 404", async () => {
	get.mockReset();
	get.mockRejectedValueOnce(
		createHttpClientError("HTTP 404", HTTP_STATUS.NOT_FOUND)
	);
	get.mockImplementation(async (url: string) => ({
		rows: url.includes("BTCUSDT")
			? [
					{ close: 60_000, closeTimestamp: "2026-11-20T09:58:59.999Z" },
					{ close: 60_100, closeTimestamp: "2026-11-20T09:59:59.999Z" },
					{ close: 60_200, closeTimestamp: "2026-11-20T10:00:59.999Z" }, // still open
				]
			: [{ close: 3_000, closeTimestamp: "2026-11-19T09:59:59.999Z" }],
	}));
	const prices = await new ScraperPrices({} as never, () => NOW).latest([
		"BTCUSDT",
		"ETHUSDT",
	]);
	expect(prices).toEqual({
		BTCUSDT: { price: 60_100, at: Date.parse("2026-11-20T09:59:59.999Z") },
	});
	expect(get.mock.calls[1][0]).toContain(
		"/v2/candles/symbols/BTCUSDT?from=2026-11-20T09:45:30.000Z"
	);
});

it.each([
	[
		"a 500",
		createHttpClientError("HTTP 500", HTTP_STATUS.INTERNAL_SERVER_ERROR),
	],
	["a timeout", createHttpClientTimeoutError("timeout", 5_000)],
])("rethrows %s without falling back", async (_, error) => {
	get.mockReset();
	get.mockRejectedValue(error);
	await expect(
		new ScraperPrices({} as never, () => NOW).latest(["BTCUSDT"])
	).rejects.toBe(error);
	expect(get).toHaveBeenCalledTimes(1);
});

it("bounds the price call under the default submit deadline, retry included (#2299)", async () => {
	get.mockClear();
	get.mockResolvedValue({ rows: [] });
	await new ScraperPrices({} as never, () => NOW).latest(["BTCUSDT"]);
	const { timeoutMs, retryCount } = get.mock.calls[0][1];
	// Worst case: every attempt times out, plus the first backoff (200 ms + 20 % jitter).
	const worstMs = timeoutMs * (retryCount + 1) + 240;
	expect(retryCount).toBeGreaterThanOrEqual(1);
	expect(worstMs).toBeLessThan(
		RiskLimits.shape.submitTimeoutMs.parse(undefined)
	);
});

it("bounds the 404 fallback by what the first call left of the submit deadline", async () => {
	get.mockReset();
	let clock = NOW;
	get.mockImplementationOnce(
		async (_url: string, { timeoutMs, retryCount }) => {
			// Worst first call: an attempt times out, the retry answers 404.
			clock += timeoutMs * (retryCount + 1) + 240;
			throw createHttpClientError("HTTP 404", HTTP_STATUS.NOT_FOUND);
		}
	);
	get.mockResolvedValue({ rows: [] });
	await new ScraperPrices({} as never, () => clock).latest([
		"BTCUSDT",
		"ETHUSDT",
	]);
	expect(get).toHaveBeenCalledTimes(3);
	for (const [, { timeoutMs, retryCount }] of get.mock.calls.slice(1)) {
		expect(retryCount).toBe(0);
		expect(timeoutMs).toBeGreaterThan(0);
		// Fallback calls run in parallel: one attempt each after the first call.
		expect(clock - NOW + timeoutMs).toBeLessThan(
			RiskLimits.shape.submitTimeoutMs.parse(undefined)
		);
	}
});
