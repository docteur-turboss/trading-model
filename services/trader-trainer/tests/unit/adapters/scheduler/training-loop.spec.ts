import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";
import { TradingSymbol } from "@trading-model/primitives/primitives";

const MOCK_LOGGER = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
jest.mock("@trading-model/contracts/logger-registry", () => ({
	getLogger: () => MOCK_LOGGER,
}));

import { TrainingLoop } from "../../../../src/adapters/inbound/scheduler/training-loop";
import type { Trainer } from "../../../../src/application/trainer";
import type { MarketDataBuffer } from "../../../../src/domain/market-data-buffer";

const BTC = TradingSymbol.of("BTCUSDT");
const ETH = TradingSymbol.of("ETHUSDT");
const NOW = 1_800_000_000_000;
const MINUTE = 60_000;
const MAX_AGE = 15 * MINUTE;

describe("TrainingLoop", () => {
	let train: jest.Mock<(symbol: TradingSymbol) => Promise<void>>;
	let lastClose: Map<TradingSymbol, number | undefined>;
	let candleCount: number;
	let loop: TrainingLoop;

	const runOnce = async (symbols: TradingSymbol[] = [BTC]) => {
		loop.start({ symbols, intervalMs: MINUTE, maxDataAgeMs: MAX_AGE });
		loop.stop();
		// start() fires the first cycle without awaiting it.
		await Promise.resolve();
		await Promise.resolve();
	};

	beforeEach(() => {
		jest.clearAllMocks();
		jest.spyOn(Date, "now").mockReturnValue(NOW);
		train = jest.fn(async () => {});
		lastClose = new Map();
		candleCount = 1000;
		const trainer = { train, isTraining: () => false } as unknown as Trainer;
		const buffer = {
			getMaxSize: () => 1000,
			getCandleCount: () => candleCount,
			getLastCandleCloseTime: (symbol: TradingSymbol) => lastClose.get(symbol),
		} as unknown as MarketDataBuffer;
		loop = new TrainingLoop(trainer, buffer);
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

	it("should not train while a session is already running", async () => {
		lastClose.set(BTC, NOW - MINUTE);
		const busy = new TrainingLoop(
			{ train, isTraining: () => true } as unknown as Trainer,
			{
				getMaxSize: () => 1000,
				getCandleCount: () => candleCount,
				getLastCandleCloseTime: (symbol: TradingSymbol) =>
					lastClose.get(symbol),
			} as unknown as MarketDataBuffer
		);

		busy.start({ symbols: [BTC], intervalMs: MINUTE, maxDataAgeMs: MAX_AGE });
		busy.stop();
		await Promise.resolve();

		expect(train).not.toHaveBeenCalled();
	});

	it("should not judge freshness while the buffer is still filling", async () => {
		candleCount = 10;

		await runOnce();

		expect(train).not.toHaveBeenCalled();
		expect(MOCK_LOGGER.warn).not.toHaveBeenCalled();
	});
});
