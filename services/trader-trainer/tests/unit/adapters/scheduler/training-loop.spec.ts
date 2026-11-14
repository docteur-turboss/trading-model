import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";
import { TradingSymbol } from "@trading-model/primitives/primitives";

const MOCK_LOGGER = {
	info: jest.fn<(...args: any[]) => any>(),
	warn: jest.fn<(...args: any[]) => any>(),
	error: jest.fn<(...args: any[]) => any>(),
};
jest.mock("@trading-model/contracts/logger-registry", () => ({
	getLogger: () => MOCK_LOGGER,
}));

import { TrainingLoop } from "../../../../src/adapters/inbound/scheduler/training-loop";
import type { Trainer } from "../../../../src/application/trainer";
import { hasEnoughTrainingData } from "../../../../src/domain/market-data/window-splitter";
import type { MarketDataBuffer } from "../../../../src/domain/market-data-buffer";

const BTC = TradingSymbol.of("BTCUSDT");
const ETH = TradingSymbol.of("ETHUSDT");
const NOW = 1_800_000_000_000;
const MINUTE = 60_000;
const MAX_AGE = 15 * MINUTE;
const WINDOWING = {
	validationSplit: 0.2,
	testSplit: 0.15,
	walkForwardFolds: 1,
};

describe("TrainingLoop", () => {
	let train: jest.Mock<(symbol: TradingSymbol) => Promise<void>>;
	let stopTraining: jest.Mock<() => Promise<void>>;
	let lastClose: Map<TradingSymbol, number | undefined>;
	let candleCount: number;
	let loop: TrainingLoop;

	const runOnce = async (symbols: TradingSymbol[] = [BTC]) => {
		loop.start({ symbols, intervalMs: MINUTE, maxDataAgeMs: MAX_AGE });
		await loop.stop();
		// start() fires the first cycle without awaiting it.
		await Promise.resolve();
		await Promise.resolve();
	};

	beforeEach(() => {
		jest.clearAllMocks();
		jest.spyOn(Date, "now").mockReturnValue(NOW);
		train = jest.fn(async (..._args: any[]) => {});
		stopTraining = jest.fn(async () => {});
		lastClose = new Map();
		candleCount = 1000;
		const trainer = {
			train,
			isTraining: () => false,
			stopTraining,
		} as unknown as Trainer;
		const buffer = {
			getMaxSize: () => 1000,
			getCandleCount: () => candleCount,
			getLastCandleCloseTime: (symbol: TradingSymbol) => lastClose.get(symbol),
		} as unknown as MarketDataBuffer;
		loop = new TrainingLoop(trainer, buffer, WINDOWING);
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it("should train a symbol whose newest candle is recent", async () => {
		lastClose.set(BTC, NOW - 2 * MINUTE);

		await runOnce();

		expect(train).toHaveBeenCalledWith(BTC);
		expect(MOCK_LOGGER.warn).not.toHaveBeenCalled();
	});

	it("should not train on stale data and warn once per outage", async () => {
		lastClose.set(BTC, NOW - MAX_AGE - 1);

		await runOnce();
		await runOnce();

		expect(train).not.toHaveBeenCalled();
		expect(MOCK_LOGGER.warn).toHaveBeenCalledTimes(1);
		expect(MOCK_LOGGER.warn).toHaveBeenCalledWith(
			"Market data is stale: training paused",
			{ context: { symbol: BTC, lastCandleClose: NOW - MAX_AGE - 1 } }
		);
	});

	it("should resume and log once when fresh data arrives again", async () => {
		lastClose.set(BTC, NOW - MAX_AGE - 1);
		await runOnce();

		lastClose.set(BTC, NOW - MINUTE);
		await runOnce();

		expect(train).toHaveBeenCalledWith(BTC);
		expect(MOCK_LOGGER.info).toHaveBeenCalledWith(
			"Market data is fresh again: training resumed",
			{ context: { symbol: BTC } }
		);
	});

	it("should skip a stale symbol and train the next fresh one", async () => {
		lastClose.set(BTC, NOW - MAX_AGE - 1);
		lastClose.set(ETH, NOW - MINUTE);

		await runOnce([BTC, ETH]);

		expect(train).toHaveBeenCalledTimes(1);
		expect(train).toHaveBeenCalledWith(ETH);
	});

	it("should train every fresh symbol in turn", async () => {
		lastClose.set(BTC, NOW - MINUTE);
		lastClose.set(ETH, NOW - MINUTE);

		for (let cycle = 0; cycle < 10; cycle++) {
			await runOnce([BTC, ETH]);
		}

		const trained = train.mock.calls.map(([symbol]) => symbol);
		expect(trained.filter((s) => s === BTC)).toHaveLength(5);
		expect(trained.filter((s) => s === ETH)).toHaveLength(5);
	});

	it("should still train the next symbol when the first one keeps failing", async () => {
		lastClose.set(BTC, NOW - MINUTE);
		lastClose.set(ETH, NOW - MINUTE);
		train.mockImplementation(async (symbol) => {
			if (symbol === BTC) {
				throw new Error("non-monotonic series");
			}
		});

		for (let cycle = 0; cycle < 4; cycle++) {
			await runOnce([BTC, ETH]);
		}

		expect(train).toHaveBeenCalledWith(ETH);
		expect(train.mock.calls.filter(([s]) => s === ETH)).toHaveLength(2);
		expect(MOCK_LOGGER.error).toHaveBeenCalledWith("Training cycle failed", {
			error: "non-monotonic series",
		});
	});

	it("should give a skipped symbol its turn once it is eligible again", async () => {
		lastClose.set(BTC, NOW - MAX_AGE - 1);
		lastClose.set(ETH, NOW - MINUTE);
		await runOnce([BTC, ETH]);

		lastClose.set(BTC, NOW - MINUTE);
		await runOnce([BTC, ETH]);

		expect(train.mock.calls.map(([s]) => s)).toEqual([ETH, BTC]);
	});

	it("should end the session in flight and stop scheduling on stop (ADR-0058)", async () => {
		jest.useFakeTimers({ now: NOW });
		try {
			lastClose.set(BTC, NOW - MINUTE);
			loop.start({ symbols: [BTC], intervalMs: MINUTE, maxDataAgeMs: MAX_AGE });
			await loop.stop();
			jest.advanceTimersByTime(5 * MINUTE);

			expect(stopTraining).toHaveBeenCalledTimes(1);
			expect(train).toHaveBeenCalledTimes(1);
		} finally {
			jest.useRealTimers();
		}
	});

	it("should not train while a session is already running", async () => {
		lastClose.set(BTC, NOW - MINUTE);
		const busy = new TrainingLoop(
			{ train, isTraining: () => true, stopTraining } as unknown as Trainer,
			{
				getMaxSize: () => 1000,
				getCandleCount: () => candleCount,
				getLastCandleCloseTime: (symbol: TradingSymbol) =>
					lastClose.get(symbol),
			} as unknown as MarketDataBuffer,
			WINDOWING
		);

		busy.start({ symbols: [BTC], intervalMs: MINUTE, maxDataAgeMs: MAX_AGE });
		await busy.stop();
		await Promise.resolve();

		expect(train).not.toHaveBeenCalled();
	});

	it("should call train() only when the validator would accept the series", async () => {
		lastClose.set(BTC, NOW - MINUTE);
		for (const count of [1, 12, 13, 14, 20, 100]) {
			candleCount = count;
			train.mockClear();
			await runOnce();
			expect(train.mock.calls.length === 1).toBe(
				hasEnoughTrainingData(count, 0.2, 1)
			);
		}
	});

	it("should follow the rule with walk-forward folds and a split other than 0.2", async () => {
		const windowing = {
			validationSplit: 0.99,
			testSplit: 0.15,
			walkForwardFolds: 5,
		};
		const trainer = {
			train,
			isTraining: () => false,
			stopTraining,
		} as unknown as Trainer;
		const buffer = {
			getMaxSize: () => 1000,
			getCandleCount: () => candleCount,
			getLastCandleCloseTime: () => NOW - MINUTE,
		} as unknown as MarketDataBuffer;
		loop = new TrainingLoop(trainer, buffer, windowing);
		for (const count of [13, 14, 50, 100]) {
			candleCount = count;
			train.mockClear();
			await runOnce();
			expect(train.mock.calls.length === 1).toBe(
				hasEnoughTrainingData(count, 0.99, 5)
			);
		}
	});

	it("should not judge freshness while the buffer is still filling", async () => {
		candleCount = 10;

		await runOnce();

		expect(train).not.toHaveBeenCalled();
		expect(MOCK_LOGGER.warn).not.toHaveBeenCalled();
	});
});
