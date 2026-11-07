import { describe, expect, it, jest } from "@jest/globals";
import { eventually, metric, persistedCandles } from "./helpers";

/**
 * Market data flow: Binance (stub) → financial-scraper cron → MySQL, and
 * financial-scraper → message-manager → trader-trainer buffer.
 *
 * Health checks stay green while this path is broken (2026-10: the scrape
 * cron never started and nothing was published), so this spec asserts the
 * data itself. Needs the E2E overlay (tests/e2e/docker-compose.e2e.yml).
 *
 * Services only accept SPIFFE mTLS clients, so the assertions run inside the
 * stack: MySQL through the mysql CLI, the trainer metrics through curl in the
 * scraper container with its SVID (the scraper is an allowed trainer caller).
 */

const FLOW_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 5_000;
const SYMBOL = "BTCUSDT";

jest.setTimeout(FLOW_TIMEOUT_MS + 30_000);

const POLL = { timeoutMs: FLOW_TIMEOUT_MS, intervalMs: POLL_INTERVAL_MS };

function trainerBufferSize(symbol: string): number {
	return metric(
		"https://trader-trainer:3000/metrics",
		new RegExp(
			`^tt_market_data_buffer_size\\{symbol="${symbol}"\\} (\\S+)$`,
			"m"
		)
	);
}

describe("Market data flow E2E", () => {
	it("persists the candles the scraper fetches from Binance", async () => {
		const count = await eventually(
			`${SYMBOL} candles in MySQL`,
			() => {
				const rows = persistedCandles(SYMBOL);
				return rows > 0 ? rows : undefined;
			},
			POLL
		);
		expect(count).toBeGreaterThan(0);
	});

	it("delivers the published market data to the trainer", async () => {
		const size = await eventually(
			`${SYMBOL} candles in the trainer buffer`,
			() => {
				const entries = trainerBufferSize(SYMBOL);
				return entries > 0 ? entries : undefined;
			},
			POLL
		);
		expect(size).toBeGreaterThan(0);
	});
});
