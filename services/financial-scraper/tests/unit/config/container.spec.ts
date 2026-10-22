import { describe, expect, it, jest } from "@jest/globals";

const MOCK_CRON_CONSTRUCTOR = jest.fn((config: unknown) => ({
	config,
	start: jest.fn(),
}));

jest.mock("../../../src/adapters/inbound/cron/binance.cron", () => ({
	BinanceCronOrchestrator: MOCK_CRON_CONSTRUCTOR,
}));

jest.mock(
	"../../../src/adapters/outbound/persistence/market-data.model",
	() => ({
		MarketDataModel: {},
	})
);

import { createScrapeScheduler } from "../../../src/config/container";

describe("config/container — createScrapeScheduler", () => {
	it("should return null when no symbol is tracked", async () => {
		const scheduler = await createScrapeScheduler({
			SCRAPE_INTERVAL: "*/1 * * * *",
			SYMBOLS_TO_TRACK: [],
		});

		expect(scheduler).toBeNull();
		expect(MOCK_CRON_CONSTRUCTOR).not.toHaveBeenCalled();
	});

	it("should build the Binance cron with the schedule and the tracked symbols", async () => {
		const scheduler = await createScrapeScheduler({
			SCRAPE_INTERVAL: "*/5 * * * *",
			SYMBOLS_TO_TRACK: ["BTCUSDT", "ETHUSDT"],
		});

		expect(scheduler).not.toBeNull();
		expect(MOCK_CRON_CONSTRUCTOR).toHaveBeenCalledWith({
			schedule: "*/5 * * * *",
			symbols: ["BTCUSDT", "ETHUSDT"],
		});
	});
});
