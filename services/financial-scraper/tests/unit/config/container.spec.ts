import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const MOCK_CRON_CONSTRUCTOR = jest.fn((config: unknown) => ({
	config,
	start: jest.fn(),
}));

const MOCK_LOGGER = {
	info: jest.fn(),
	warn: jest.fn(),
};

jest.mock("@trading-model/http/infrastructure/logger", () => ({
	logger: MOCK_LOGGER,
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
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("should return null and log at info level when the scheduler is disabled", async () => {
		const scheduler = await createScrapeScheduler({
			SCRAPE_INTERVAL: "*/1 * * * *",
			SYMBOLS_TO_TRACK: ["BTCUSDT"],
			SCRAPE_SCHEDULER_ENABLED: false,
		});

		expect(scheduler).toBeNull();
		expect(MOCK_CRON_CONSTRUCTOR).not.toHaveBeenCalled();
		expect(MOCK_LOGGER.info).toHaveBeenCalledWith(
			expect.stringContaining("SCRAPE_SCHEDULER_ENABLED=false")
		);
		expect(MOCK_LOGGER.warn).not.toHaveBeenCalled();
	});

	it("should return null and warn when no symbol is tracked", async () => {
		const scheduler = await createScrapeScheduler({
			SCRAPE_INTERVAL: "*/1 * * * *",
			SYMBOLS_TO_TRACK: [],
			SCRAPE_SCHEDULER_ENABLED: true,
		});

		expect(scheduler).toBeNull();
		expect(MOCK_CRON_CONSTRUCTOR).not.toHaveBeenCalled();
		expect(MOCK_LOGGER.warn).toHaveBeenCalledWith(
			expect.stringContaining("market data collection is disabled")
		);
	});

	it("should build the Binance cron with the schedule and the tracked symbols", async () => {
		const scheduler = await createScrapeScheduler({
			SCRAPE_INTERVAL: "*/5 * * * *",
			SYMBOLS_TO_TRACK: ["BTCUSDT", "ETHUSDT"],
			SCRAPE_SCHEDULER_ENABLED: true,
		});

		expect(scheduler).not.toBeNull();
		expect(MOCK_CRON_CONSTRUCTOR).toHaveBeenCalledWith({
			schedule: "*/5 * * * *",
			symbols: ["BTCUSDT", "ETHUSDT"],
		});
		expect(MOCK_LOGGER.info).toHaveBeenCalledWith(
			"Market data collection enabled",
			{ symbols: ["BTCUSDT", "ETHUSDT"], schedule: "*/5 * * * *" }
		);
		expect(MOCK_LOGGER.warn).not.toHaveBeenCalled();
	});
});
