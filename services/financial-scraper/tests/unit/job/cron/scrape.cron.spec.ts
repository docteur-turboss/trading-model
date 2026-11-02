import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { CandleInterval } from "@trading-model/contracts/market-data.types";
import {
	DataSource,
	PositiveInt,
	TradingSymbol,
} from "@trading-model/primitives/primitives";

jest.mock("os", () => ({
	cpus: jest.fn(() => new Array(4).fill({})),
}));

const MOCK_CRON_SCHEDULE = jest.fn<any>();
jest.mock("node-cron", () => ({
	schedule: MOCK_CRON_SCHEDULE,
}));

const MOCK_LIMIT = jest.fn((fn: (...args: unknown[]) => unknown) => fn());
jest.mock("p-limit", () => {
	const pLimit = jest.fn(() => MOCK_LIMIT);
	return pLimit;
});

jest.mock("@trading-model/http/infrastructure/logger", () => ({
	logger: {
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		debug: jest.fn(),
	},
}));

const MOCK_FETCH_SNAPSHOT = jest.fn<any>();
const MOCK_PUBLISH = jest.fn<any>();
const MOCK_PERSIST = jest.fn<any>();

jest.mock("@trading-model/contracts/logger-registry", () => ({
	getLogger: () =>
		(
			jest.requireMock("@trading-model/http/infrastructure/logger") as {
				logger: unknown;
			}
		).logger,
	setLogger: () => {},
}));

import { logger } from "@trading-model/http/infrastructure/logger";
import { ScrapeCronOrchestrator } from "../../../../src/adapters/inbound/cron/scrape.cron";

const MOCK_LOGGER = jest.mocked(logger);
const DEPS = {
	source: { id: DataSource.Binance, fetchSnapshot: MOCK_FETCH_SNAPSHOT },
	publisher: { publish: MOCK_PUBLISH },
	persist: MOCK_PERSIST,
};

const GET_CRON_HANDLER = (): ((...args: unknown[]) => Promise<unknown>) =>
	MOCK_CRON_SCHEDULE.mock.calls[0][1] as (
		...args: unknown[]
	) => Promise<unknown>;

const BTC = TradingSymbol.of("BTCUSDT");
const ETH = TradingSymbol.of("ETHUSDT");

describe("ScrapeCronOrchestrator", () => {
	const defaultConfig = {
		schedule: "*/1 * * * *",
		symbols: [BTC, ETH],
		deps: DEPS,
	};

	beforeEach(() => {
		jest.clearAllMocks();
		MOCK_FETCH_SNAPSHOT.mockResolvedValue({ fetchedAt: Date.now() });
		MOCK_PUBLISH.mockResolvedValue([]);
	});

	describe("constructor", () => {
		it("should create instance with default concurrency based on cpus * 2", () => {
			const orchestrator = new ScrapeCronOrchestrator({ ...defaultConfig });
			expect(orchestrator).toBeDefined();
		});

		it("should use provided maxConcurrency when specified", () => {
			const orchestrator = new ScrapeCronOrchestrator({
				...defaultConfig,
				maxConcurrency: PositiveInt.of(3),
			});
			expect(orchestrator).toBeDefined();
		});

		it("should cap concurrency at symbols length", () => {
			const orchestrator = new ScrapeCronOrchestrator({
				schedule: "*/1 * * * *",
				symbols: [BTC],
				maxConcurrency: PositiveInt.of(100),
				deps: DEPS,
			});
			expect(orchestrator).toBeDefined();
		});
	});

	describe("start", () => {
		it("should schedule cron with provided schedule", () => {
			const orchestrator = new ScrapeCronOrchestrator(defaultConfig);
			orchestrator.start();
			expect(MOCK_CRON_SCHEDULE).toHaveBeenCalledWith(
				"*/1 * * * *",
				expect.any(Function)
			);
		});

		it("should execute batch when cron fires", async () => {
			const orchestrator = new ScrapeCronOrchestrator(defaultConfig);
			orchestrator.start();

			const cronHandler = GET_CRON_HANDLER();
			MOCK_FETCH_SNAPSHOT.mockResolvedValue({ fetchedAt: Date.now() });
			MOCK_PERSIST.mockResolvedValue(undefined);

			await cronHandler();

			expect(MOCK_FETCH_SNAPSHOT).toHaveBeenCalledTimes(2);
			expect(MOCK_PUBLISH).toHaveBeenCalledTimes(2);
			expect(MOCK_PERSIST).toHaveBeenCalledTimes(2);
		});

		it("should skip execution if already running", async () => {
			const orchestrator = new ScrapeCronOrchestrator(defaultConfig);
			orchestrator.start();

			const cronHandler = GET_CRON_HANDLER();

			let resolveFirstRun: () => void;
			const firstRunPromise = new Promise<void>((resolve) => {
				resolveFirstRun = resolve;
			});

			MOCK_FETCH_SNAPSHOT.mockImplementationOnce(
				() =>
					new Promise<void>((resolve) =>
						setTimeout(() => {
							resolve();
							resolveFirstRun!();
						}, 100)
					)
			);
			MOCK_PERSIST.mockResolvedValue(undefined);

			const run1 = cronHandler();
			const run2 = cronHandler();

			await firstRunPromise;
			await run1;
			await run2;

			expect(MOCK_LOGGER.warn).toHaveBeenCalledWith(
				"Previous execution still running"
			);
		});

		it("should handle errors during batch execution", async () => {
			const orchestrator = new ScrapeCronOrchestrator(defaultConfig);
			orchestrator.start();

			const cronHandler = GET_CRON_HANDLER();
			MOCK_FETCH_SNAPSHOT.mockRejectedValue(new Error("Worker failed"));

			await expect(cronHandler()).resolves.toBeUndefined();
			expect(MOCK_LOGGER.error).toHaveBeenCalled();
		});

		it("should handle unknown errors during batch execution", async () => {
			const orchestrator = new ScrapeCronOrchestrator(defaultConfig);
			orchestrator.start();

			const cronHandler = GET_CRON_HANDLER();
			MOCK_FETCH_SNAPSHOT.mockRejectedValue("String error" as never);

			await expect(cronHandler()).resolves.toBeUndefined();
			expect(MOCK_LOGGER.error).toHaveBeenCalledWith("Symbol scrape failed", {
				context: { source: DataSource.Binance, symbol: BTC },
				error: "String error",
			});
		});

		it("should reset isRunning after execution", async () => {
			const orchestrator = new ScrapeCronOrchestrator(defaultConfig);
			orchestrator.start();

			const cronHandler = GET_CRON_HANDLER();
			MOCK_FETCH_SNAPSHOT.mockResolvedValue({ fetchedAt: Date.now() });
			MOCK_PERSIST.mockResolvedValue(undefined);

			await cronHandler();
			await cronHandler();

			expect(MOCK_LOGGER.warn).not.toHaveBeenCalled();
			expect(MOCK_FETCH_SNAPSHOT).toHaveBeenCalledTimes(4);
		});

		it("should use default candle interval when not provided", async () => {
			const orchestrator = new ScrapeCronOrchestrator(defaultConfig);
			orchestrator.start();

			const cronHandler = GET_CRON_HANDLER();
			MOCK_FETCH_SNAPSHOT.mockResolvedValue({ fetchedAt: Date.now() });
			MOCK_PERSIST.mockResolvedValue(undefined);

			await cronHandler();

			expect(MOCK_FETCH_SNAPSHOT).toHaveBeenCalledWith(
				expect.objectContaining({ interval: CandleInterval.Min1 })
			);
		});

		it("should use provided candle interval", async () => {
			const orchestrator = new ScrapeCronOrchestrator({
				...defaultConfig,
				candleInterval: CandleInterval.Min5,
			});
			orchestrator.start();

			const cronHandler = GET_CRON_HANDLER();
			MOCK_FETCH_SNAPSHOT.mockResolvedValue({ fetchedAt: Date.now() });
			MOCK_PERSIST.mockResolvedValue(undefined);

			await cronHandler();

			expect(MOCK_FETCH_SNAPSHOT).toHaveBeenCalledWith(
				expect.objectContaining({ interval: CandleInterval.Min5 })
			);
		});
	});

	describe("stop", () => {
		it("should stop the cron, then wait for the running cycle and its publishes", async () => {
			const task = { stop: jest.fn() };
			MOCK_CRON_SCHEDULE.mockReturnValue(task);
			let release: (failed: unknown[]) => void = () => undefined;
			MOCK_PUBLISH.mockImplementation(
				() =>
					new Promise((resolve) => {
						release = resolve;
					})
			);
			const orchestrator = new ScrapeCronOrchestrator({
				...defaultConfig,
				symbols: [BTC],
			});
			orchestrator.start();
			await GET_CRON_HANDLER()();

			let stopped = false;
			const stopping = orchestrator.stop().then(() => {
				stopped = true;
			});
			await new Promise((resolve) => setImmediate(resolve));

			expect(task.stop).toHaveBeenCalled();
			expect(stopped).toBe(false);
			release([]);
			await stopping;
			expect(stopped).toBe(true);
		});

		it("should resolve when the cron was never started", async () => {
			await expect(
				new ScrapeCronOrchestrator(defaultConfig).stop()
			).resolves.toBeUndefined();
		});
	});
});
