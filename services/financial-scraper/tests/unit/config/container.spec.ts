import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const MOCK_CRON_CONSTRUCTOR = jest.fn((config: unknown) => ({
	config,
	start: jest.fn<(...args: any[]) => any>(),
	stop: jest.fn(async () => undefined),
}));

const MOCK_LOGGER = {
	info: jest.fn<(...args: any[]) => any>(),
	warn: jest.fn<(...args: any[]) => any>(),
	error: jest.fn<(...args: any[]) => any>(),
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
		BinanceMarketDataSource: jest.fn((..._args: any[]) => ({ id: "binance" })),
	})
);
jest.mock(
	"../../../src/adapters/outbound/broker/broker-market-data.publisher",
	() => ({
		BrokerMarketDataPublisher: jest.fn((..._args: any[]) => ({
			publish: jest.fn<(...args: any[]) => any>(),
		})),
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

const MOCK_LEASE_API = jest.fn((name: string) => ({ name }));
jest.mock("@trading-model/reliability/kubernetes-lease", () => ({
	KubernetesLease: jest.fn((identity: string, api: unknown) => ({
		identity,
		api,
	})),
	kubernetesLeaseApi: MOCK_LEASE_API,
}));

import { Leadership } from "@trading-model/reliability/leadership";
import { SignalCronScheduler } from "../../../src/adapters/inbound/cron/signal.cron";
import {
	createCollector,
	createScrapeScheduler,
	createSignalScheduler,
	signalUserAgent,
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
		SIGNAL_CONTACT_EMAIL: "ops@example.org",
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

	it("collects no signal with a contact that is no e-mail", () => {
		expect(
			createSignalScheduler({
				...ENABLED,
				SIGNAL_CONTACT_EMAIL: "automated news analysis",
			})
		).toBeNull();
		expect(MOCK_LOGGER.error).toHaveBeenCalledWith(
			expect.stringContaining("SIGNAL_CONTACT_EMAIL")
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

describe("config/container — signalUserAgent", () => {
	it("names the client, then the contact e-mail SEC EDGAR asks for", () => {
		expect(signalUserAgent("ops@example.org")).toBe(
			"automated news analysis ops@example.org"
		);
	});

	it("falls back to the repository URL as contact", () => {
		expect(signalUserAgent("")).toBe(
			"automated news analysis (+https://github.com/docteur-turboss/trading-model)"
		);
	});
});

describe("config/container — createCollector", () => {
	const COLLECTING = {
		SCRAPE_INTERVAL: "*/1 * * * *",
		SYMBOLS_TO_TRACK: ["BTCUSDT"],
		SCRAPE_SCHEDULER_ENABLED: true,
		SIGNAL_COLLECTION_ENABLED: false,
		SIGNAL_CONTACT_EMAIL: "",
		COLLECTOR_LEASE_NAME: "",
		INSTANCE_ID: "pod-a",
	};

	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("returns null on an HTTP-only replica: no lease is even read", async () => {
		await expect(
			createCollector({
				...COLLECTING,
				SCRAPE_SCHEDULER_ENABLED: false,
				COLLECTOR_LEASE_NAME: "lease",
			})
		).resolves.toBeNull();
		expect(MOCK_LEASE_API).not.toHaveBeenCalled();
	});

	it("collects without election when no lease is named", async () => {
		const collector = await createCollector(COLLECTING);
		expect(collector).toBeInstanceOf(Leadership);
		expect(MOCK_LEASE_API).not.toHaveBeenCalled();
	});

	it("elects through the named Kubernetes Lease, as INSTANCE_ID", async () => {
		const collector = await createCollector({
			...COLLECTING,
			COLLECTOR_LEASE_NAME: "financial-scraper-collector",
		});
		expect(collector).toBeInstanceOf(Leadership);
		expect(MOCK_LEASE_API).toHaveBeenCalledWith("financial-scraper-collector");
		expect(MOCK_LOGGER.info).toHaveBeenCalledWith(
			"Collector leader election enabled",
			{
				lease: "financial-scraper-collector",
				identity: "pod-a",
			}
		);
	});

	it("starts and stops every scheduler with the leadership", async () => {
		const collector = await createCollector(COLLECTING);
		const cron = MOCK_CRON_CONSTRUCTOR.mock.results[0].value as {
			start: jest.Mock;
			stop: jest.Mock;
		};
		collector?.start();
		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(cron.start).toHaveBeenCalledTimes(1);
		await collector?.stop();
		expect(cron.stop).toHaveBeenCalledTimes(1);
	});
});
