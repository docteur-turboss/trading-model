import { CandleInterval } from "@trading-model/common/config/event.types";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

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

jest.mock("@trading-model/common/config/logger", () => ({
	logger: {
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		debug: jest.fn(),
	},
}));

const MOCK_WORKER_RUN = jest.fn<any>();
jest.mock("../../../../src/job/worker/binance.worker", () => ({
	BinanceWorker: jest.fn(() => ({
		run: MOCK_WORKER_RUN,
	})),
}));

jest.mock("../../../../src/infra/market-data/market-data.controller", () => ({
	MarketDataController: {
		persist: jest.fn<any>(),
	},
}));

import { logger } from "@trading-model/common/config/logger";
import { MarketDataController } from "../../../../src/infra/market-data/market-data.controller";
import { BinanceCronOrchestrator } from "../../../../src/job/cron/binance.cron";

const MOCK_LOGGER = jest.mocked(logger);
const MOCK_PERSIST = jest.mocked(MarketDataController.persist);

const GET_CRON_HANDLER = (): ((...args: unknown[]) => Promise<unknown>) =>
	MOCK_CRON_SCHEDULE.mock.calls[0][1] as (
		...args: unknown[]
	) => Promise<unknown>;

describe("BinanceCronOrchestrator", () => {
	const defaultConfig = {
		schedule: "*/1 * * * *",
		symbols: ["BTCUSDT", "ETHUSDT"],
	};

	beforeEach(() => {
		jest.clearAllMocks();
		MOCK_WORKER_RUN.mockResolvedValue({ fetchedAt: Date.now() });
	});

	describe("constructor", () => {
		it("should create instance with default concurrency based on cpus * 2", () => {
			const orchestrator = new BinanceCronOrchestrator({ ...defaultConfig });
			expect(orchestrator).toBeDefined();
		});

		it("should use provided maxConcurrency when specified", () => {
			const orchestrator = new BinanceCronOrchestrator({
				...defaultConfig,
				maxConcurrency: 3,
			});
			expect(orchestrator).toBeDefined();
		});

		it("should cap concurrency at symbols length", () => {
			const orchestrator = new BinanceCronOrchestrator({
				schedule: "*/1 * * * *",
				symbols: ["BTCUSDT"],
				maxConcurrency: 100,
			});
			expect(orchestrator).toBeDefined();
		});
	});

	describe("start", () => {
		it("should schedule cron with provided schedule", () => {
			const orchestrator = new BinanceCronOrchestrator(defaultConfig);
			orchestrator.start();
			expect(MOCK_CRON_SCHEDULE).toHaveBeenCalledWith(
				"*/1 * * * *",
				expect.any(Function)
			);
		});

		it("should log info on start", () => {
			const orchestrator = new BinanceCronOrchestrator(defaultConfig);
			orchestrator.start();
			expect(MOCK_LOGGER.info).toHaveBeenCalled();
		});

		it("should execute batch when cron fires", async () => {
			const orchestrator = new BinanceCronOrchestrator(defaultConfig);
			orchestrator.start();

			const cronHandler = GET_CRON_HANDLER();
			MOCK_WORKER_RUN.mockResolvedValue({ fetchedAt: Date.now() });
			MOCK_PERSIST.mockResolvedValue(undefined);

			await cronHandler();

			expect(MOCK_WORKER_RUN).toHaveBeenCalledTimes(2);
			expect(MOCK_PERSIST).toHaveBeenCalledTimes(2);
		});

		it("should skip execution if already running", async () => {
			const orchestrator = new BinanceCronOrchestrator(defaultConfig);
			orchestrator.start();

			const cronHandler = GET_CRON_HANDLER();

			let resolveFirstRun: () => void;
			const firstRunPromise = new Promise<void>((resolve) => {
				resolveFirstRun = resolve;
			});

			MOCK_WORKER_RUN.mockImplementationOnce(
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
			const orchestrator = new BinanceCronOrchestrator(defaultConfig);
			orchestrator.start();

			const cronHandler = GET_CRON_HANDLER();
			MOCK_WORKER_RUN.mockRejectedValue(new Error("Worker failed"));

			await expect(cronHandler()).resolves.toBeUndefined();
			expect(MOCK_LOGGER.error).toHaveBeenCalled();
		});

		it("should handle unknown errors during batch execution", async () => {
			const orchestrator = new BinanceCronOrchestrator(defaultConfig);
			orchestrator.start();

			const cronHandler = GET_CRON_HANDLER();
			MOCK_WORKER_RUN.mockRejectedValue("String error" as never);

			await expect(cronHandler()).resolves.toBeUndefined();
			expect(MOCK_LOGGER.error).toHaveBeenCalledWith(
				"Unknown batch execution error",
				{
					err: "String error",
				}
			);
		});

		it("should reset isRunning after execution", async () => {
			const orchestrator = new BinanceCronOrchestrator(defaultConfig);
			orchestrator.start();

			const cronHandler = GET_CRON_HANDLER();
			MOCK_WORKER_RUN.mockResolvedValue({ fetchedAt: Date.now() });
			MOCK_PERSIST.mockResolvedValue(undefined);

			await cronHandler();
			await cronHandler();

			expect(MOCK_LOGGER.warn).not.toHaveBeenCalled();
			expect(MOCK_WORKER_RUN).toHaveBeenCalledTimes(4);
		});

		it("should use default candle interval when not provided", async () => {
			const orchestrator = new BinanceCronOrchestrator(defaultConfig);
			orchestrator.start();

			const cronHandler = GET_CRON_HANDLER();
			const BinanceWorker = (
				jest.requireMock("../../../../src/job/worker/binance.worker") as any
			).BinanceWorker;

			MOCK_WORKER_RUN.mockResolvedValue({ fetchedAt: Date.now() });
			MOCK_PERSIST.mockResolvedValue(undefined);

			await cronHandler();

			expect(BinanceWorker).toHaveBeenCalledWith(
				expect.objectContaining({ interval: CandleInterval.MIN1 })
			);
		});

		it("should use provided candle interval", async () => {
			const orchestrator = new BinanceCronOrchestrator({
				...defaultConfig,
				candleInterval: "5m",
			});
			orchestrator.start();

			const cronHandler = GET_CRON_HANDLER();
			const BinanceWorker = (
				jest.requireMock("../../../../src/job/worker/binance.worker") as any
			).BinanceWorker;

			MOCK_WORKER_RUN.mockResolvedValue({ fetchedAt: Date.now() });
			MOCK_PERSIST.mockResolvedValue(undefined);

			await cronHandler();

			expect(BinanceWorker).toHaveBeenCalledWith(
				expect.objectContaining({ interval: "5m" })
			);
		});
	});

	describe("persist", () => {
		it("should call MarketDataController.persist with data", async () => {
			const data = { fetchedAt: Date.now() };
			const orchestrator = new BinanceCronOrchestrator(defaultConfig);

			await (orchestrator as any).persist(data);

			expect(MOCK_PERSIST).toHaveBeenCalledWith(data);
			expect(MOCK_LOGGER.debug).toHaveBeenCalled();
		});
	});
});
