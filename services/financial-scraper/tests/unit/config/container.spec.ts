import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";

const MOCK_CRON_CONSTRUCTOR = jest.fn((config: unknown) => ({
	config,
	start: jest.fn<(...args: any[]) => any>(),
	stop: jest.fn(async () => undefined),
}));

const MOCK_RESTORE = jest.fn<() => Promise<void>>();

const MOCK_LOGGER = {
	info: jest.fn<(...args: any[]) => any>(),
	warn: jest.fn<(...args: any[]) => any>(),
	error: jest.fn<(...args: any[]) => any>(),
};

jest.mock("@trading-model/http/logger", () => ({
	logger: MOCK_LOGGER,
}));

jest.mock("../../../src/adapters/inbound/cron/scrape.cron", () => ({
	ScrapeCronOrchestrator: MOCK_CRON_CONSTRUCTOR,
}));

// The real adapter would load the HTTP client.
jest.mock(
	"../../../src/adapters/outbound/binance/binance-market-data-source",
	() => ({
		BinanceMarketDataSource: jest.fn((..._args: any[]) => ({
			id: "binance",
			restore: MOCK_RESTORE,
		})),
	})
);

jest.mock(
	"../../../src/adapters/outbound/persistence/schema/candles.schema",
	() => ({
		insertCandles: jest.fn<(...args: any[]) => any>(),
		lastCandleOpenTime: jest.fn<(...args: any[]) => any>(),
	})
);
jest.mock(
	"../../../src/adapters/outbound/persistence/schema/order-book.schema",
	() => ({
		insertOrderBook: jest.fn<(...args: any[]) => any>(),
	})
);
jest.mock(
	"../../../src/adapters/outbound/persistence/schema/ticker24h.schema",
	() => ({
		insertTicker: jest.fn<(...args: any[]) => any>(),
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
	leaseAnnotation: jest.fn(() => ({ get: jest.fn(), set: jest.fn() })),
}));

import { Leadership } from "@trading-model/reliability/leadership";
import { SignalCronScheduler } from "../../../src/adapters/inbound/cron/signal.cron";
import {
	createCollector,
	createScrapeScheduler,
	createSignalScheduler,
	scheduledSources,
	signalUserAgent,
} from "../../../src/config/container";
import { SIGNAL_SOURCE_DISABLED } from "../../../src/config/metrics";
import { SIGNAL_REGISTRY } from "../../../src/config/signal-registry";
import type { Source } from "../../../src/domain/signals";

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
});

describe("config/container — quarantine restore before the first cycle", () => {
	const SETTINGS = {
		SCRAPE_INTERVAL: "*/1 * * * *",
		SYMBOLS_TO_TRACK: ["BTCUSDT"],
		SCRAPE_SCHEDULER_ENABLED: true,
	};
	const STORE = {
		load: jest.fn(async () => ({})),
		save: jest.fn(async () => undefined),
	};

	beforeEach(() => {
		jest.clearAllMocks();
		jest.useFakeTimers();
	});
	afterEach(() => {
		jest.useRealTimers();
	});

	it("starts the cron only after restore resolves, retrying a failed read", async () => {
		MOCK_RESTORE.mockRejectedValueOnce(new Error("lease get failed"));
		const scheduler = await createScrapeScheduler(SETTINGS, STORE);
		const cron = MOCK_CRON_CONSTRUCTOR.mock.results[0].value as {
			start: jest.Mock;
		};

		scheduler?.start();
		await jest.advanceTimersByTimeAsync(0);
		expect(MOCK_RESTORE).toHaveBeenCalledTimes(1);
		expect(cron.start).not.toHaveBeenCalled();

		await jest.advanceTimersByTimeAsync(2000);
		expect(MOCK_RESTORE).toHaveBeenCalledTimes(2);
		expect(cron.start).toHaveBeenCalledTimes(1);
	});

	it("does not start the cron when stopped before restore ends", async () => {
		MOCK_RESTORE.mockRejectedValueOnce(new Error("lease get failed"));
		const scheduler = await createScrapeScheduler(SETTINGS, STORE);
		const cron = MOCK_CRON_CONSTRUCTOR.mock.results[0].value as {
			start: jest.Mock;
		};

		scheduler?.start();
		await jest.advanceTimersByTimeAsync(0);
		await scheduler?.stop();
		await jest.advanceTimersByTimeAsync(5000);

		expect(cron.start).not.toHaveBeenCalled();
	});
});

describe("config/container — createSignalScheduler", () => {
	const ENABLED = {
		SCRAPE_SCHEDULER_ENABLED: true,
		SIGNAL_COLLECTION_ENABLED: true,
		SIGNAL_CONTACT_EMAIL: "ops@example.org",
		SIGNAL_NON_COMMERCIAL_ACCEPTED: "",
		NODE_ENV: "test",
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
				"treasury-par-yield-curve",
				"ecb-hicp-annual-rate",
				"ecb-deposit-facility-rate",
				"ecb-euro-reference-rates",
				"sec-edgar-eps-diluted",
				"sec-edgar-revenue",
				"sec-edgar-core-facts",
				"cftc-cot-legacy",
				"nws-kansas-wheat-belt",
				"nasa-power-crop-regions",
				"wikipedia-pageviews",
				"federal-register-documents",
				"eurostat-house-price-index",
				"eurostat-hicp-inflation",
				"eurostat-unemployment",
				"dvf-commune-sales",
			],
		});
	});
});

describe("config/container — scheduledSources", () => {
	const [first, second] = SIGNAL_REGISTRY.sources;
	const keyed = {
		...first,
		accessPolicy: {
			...first.accessPolicy,
			auth: {
				type: "api_key",
				env: "SIGNAL_KEY_FRED",
				in: "header",
				name: "x-key",
			},
		},
	} as Source;

	const gauge = () =>
		SIGNAL_SOURCE_DISABLED.get().then((m) => JSON.stringify(m.values));

	it("skips a source without its key, flags it, and keeps the others", async () => {
		expect(scheduledSources([keyed, second], {})).toEqual([second]);
		expect(await gauge()).toContain(
			`"value":1,"labels":{"source":"${first.id}","reason":"missing_key"}`
		);
		expect(scheduledSources([keyed, second], { SIGNAL_KEY_FRED: "k" })).toEqual(
			[keyed, second]
		);
		expect(await gauge()).toContain(
			`"value":0,"labels":{"source":"${first.id}","reason":"missing_key"}`
		);
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
		SIGNAL_NON_COMMERCIAL_ACCEPTED: "",
		NODE_ENV: "test",
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
});
