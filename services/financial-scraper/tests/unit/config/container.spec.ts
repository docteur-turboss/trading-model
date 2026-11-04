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

jest.mock("../../../src/adapters/inbound/cron/scrape.cron", () => ({
	ScrapeCronOrchestrator: MOCK_CRON_CONSTRUCTOR,
}));

// The real adapters would load the HTTP client and the broker client.
jest.mock(
	"../../../src/adapters/outbound/binance/binance-market-data-source",
	() => ({
		BinanceMarketDataSource: jest.fn(() => ({ id: "binance" })),
	})
);
jest.mock(
	"../../../src/adapters/outbound/broker/broker-market-data.publisher",
	() => ({
		BrokerMarketDataPublisher: jest.fn(() => ({ publish: jest.fn() })),
	})
);

jest.mock(
	"../../../src/adapters/outbound/persistence/market-data.model",
	() => ({
		MarketDataModel: {},
	})
);

jest.mock(
	"../../../src/adapters/outbound/persistence/candle-publish-backlog",
	() => ({
		MySqlCandlePublishBacklog: { kind: "mysql-backlog" },
	})
);

jest.mock("../../../src/adapters/outbound/persistence/signal-store", () => ({
	MySqlSignalStore: { kind: "mysql-signals" },
}));

import { SignalCronScheduler } from "../../../src/adapters/inbound/cron/signal.cron";
import {
	createScrapeScheduler,
	createSignalScheduler,
} from "../../../src/config/container";

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

	it("should build the cron with the schedule, the tracked symbols and the Binance source", async () => {
		const scheduler = await createScrapeScheduler({
			SCRAPE_INTERVAL: "*/5 * * * *",
			SYMBOLS_TO_TRACK: ["BTCUSDT", "ETHUSDT"],
			SCRAPE_SCHEDULER_ENABLED: true,
		});

		expect(scheduler).not.toBeNull();
		expect(MOCK_CRON_CONSTRUCTOR).toHaveBeenCalledWith({
			schedule: "*/5 * * * *",
			symbols: ["BTCUSDT", "ETHUSDT"],
			deps: {
				source: { id: "binance" },
				publisher: { publish: expect.any(Function) },
				persist: expect.any(Function),
				backlog: { kind: "mysql-backlog" },
			},
		});
		expect(MOCK_LOGGER.info).toHaveBeenCalledWith(
			"Market data collection enabled",
			{ symbols: ["BTCUSDT", "ETHUSDT"], schedule: "*/5 * * * *" }
		);
		expect(MOCK_LOGGER.warn).not.toHaveBeenCalled();
	});
});

describe("config/container — createSignalScheduler", () => {
	const ENABLED = {
		SCRAPE_SCHEDULER_ENABLED: true,
		SIGNAL_COLLECTION_ENABLED: true,
		SIGNAL_USER_AGENT: "trading-model-test ops@example.org",
	};

	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("collects nothing on an HTTP-only replica", () => {
		expect(
			createSignalScheduler({ ...ENABLED, SCRAPE_SCHEDULER_ENABLED: false })
		).toBeNull();
	});

	it("collects nothing when signal collection is off (CI)", () => {
		expect(
			createSignalScheduler({ ...ENABLED, SIGNAL_COLLECTION_ENABLED: false })
		).toBeNull();
		expect(MOCK_LOGGER.info).toHaveBeenCalledWith(
			expect.stringContaining("SIGNAL_COLLECTION_ENABLED=false")
		);
	});

	it("schedules the registry sources on the collector", () => {
		const scheduler = createSignalScheduler(ENABLED);

		expect(scheduler).toBeInstanceOf(SignalCronScheduler);
		expect(MOCK_LOGGER.info).toHaveBeenCalledWith("Signal collection enabled", {
			sources: [
				"ecb-aaa-yield-10y",
				"sec-edgar-eps-diluted",
				"nws-kansas-wheat-belt",
				"wikipedia-pageviews",
			],
		});
	});
});
