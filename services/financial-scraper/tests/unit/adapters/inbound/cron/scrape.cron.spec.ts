import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { CandleInterval } from "@trading-model/contracts/market-data.types";
import {
	DataSource,
	TradingSymbol,
} from "@trading-model/primitives/primitives";

const MOCK_CRON_SCHEDULE = jest.fn<(...args: any[]) => any>();
jest.mock("node-cron", () => ({
	schedule: MOCK_CRON_SCHEDULE,
}));

const MOCK_LIMIT = jest.fn((fn: (...args: unknown[]) => unknown) => fn());
jest.mock("p-limit", () => {
	const pLimit = jest.fn((..._args: any[]) => MOCK_LIMIT);
	return pLimit;
});

jest.mock("@trading-model/http/logger", () => ({
	logger: {
		info: jest.fn<(...args: any[]) => any>(),
		warn: jest.fn<(...args: any[]) => any>(),
		error: jest.fn<(...args: any[]) => any>(),
		debug: jest.fn<(...args: any[]) => any>(),
	},
}));

const MOCK_FETCH_SNAPSHOT = jest.fn<(...args: any[]) => any>();
const MOCK_PERSIST = jest.fn<(...args: any[]) => any>();

jest.mock("@trading-model/contracts/logger-registry", () => ({
	getLogger: () =>
		(
			jest.requireMock("@trading-model/http/logger") as {
				logger: unknown;
			}
		).logger,
	setLogger: () => {},
}));

import { logger } from "@trading-model/http/logger";
import { ScrapeCronOrchestrator } from "../../../../../src/adapters/inbound/cron/scrape.cron";

const MOCK_LOGGER = jest.mocked(logger);
const DEPS = {
	source: { id: DataSource.Binance, fetchSnapshot: MOCK_FETCH_SNAPSHOT },
	persist: MOCK_PERSIST,
	lastCandleOpenTime: async () => undefined,
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
	});

	describe("constructor", () => {
		// the default is min(8, symbols), whatever the host cores
		it.each([
			["default concurrency capped at 2 symbols", {}, 2],
			["default concurrency capped at 1 symbol", { symbols: [BTC] }, 1],
			[
				"default concurrency capped at 8",
				{
					symbols: Array.from({ length: 20 }, (_, i) =>
						TradingSymbol.of(`S${i}USDT`)
					),
				},
				8,
			],
		])(
			"should limit a cycle with the %s",
			async (_name, overrides, expected) => {
				MOCK_PERSIST.mockResolvedValue(undefined);
				new ScrapeCronOrchestrator({ ...defaultConfig, ...overrides }).start();

				await GET_CRON_HANDLER()();

				expect(jest.requireMock("p-limit")).toHaveBeenCalledWith(expected);
			}
		);
	});

	describe("start", () => {
		it("should schedule cron with provided schedule", () => {
			const orchestrator = new ScrapeCronOrchestrator(defaultConfig);
			orchestrator.start();
			expect(MOCK_CRON_SCHEDULE).toHaveBeenCalledWith(
				"*/1 * * * *",
				expect.any(Function),
				{ timezone: "Etc/UTC" }
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
	});

	describe("stop", () => {
		it("should stop the cron", async () => {
			const task = { stop: jest.fn<(...args: any[]) => any>() };
			MOCK_CRON_SCHEDULE.mockReturnValue(task);
			const orchestrator = new ScrapeCronOrchestrator({
				...defaultConfig,
				symbols: [BTC],
			});
			orchestrator.start();

			await orchestrator.stop();

			expect(task.stop).toHaveBeenCalled();
		});

		it("should fetch nothing more once stopped during a cycle", async () => {
			MOCK_CRON_SCHEDULE.mockReturnValue({ stop: jest.fn() });
			const orchestrator = new ScrapeCronOrchestrator(defaultConfig);
			orchestrator.start();

			const cycle = GET_CRON_HANDLER()();
			await orchestrator.stop();
			await cycle;

			expect(MOCK_FETCH_SNAPSHOT).not.toHaveBeenCalled();
		});

		it("should resolve when the cron was never started", async () => {
			await expect(
				new ScrapeCronOrchestrator(defaultConfig).stop()
			).resolves.toBeUndefined();
		});
	});
});
