import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
	CandleInterval,
	MarketType,
} from "@trading-model/contracts/market-data.types";
import {
	DataSource,
	PositiveInt,
	TradingSymbol,
	UnixTimestamp,
} from "@trading-model/primitives/primitives";

jest.mock("p-limit", () =>
	jest.fn(
		(..._args: any[]) =>
			(fn: (...args: unknown[]) => unknown) =>
				fn()
	)
);

const mockLog = {
	debug: jest.fn<(...args: any[]) => any>(),
	info: jest.fn<(...args: any[]) => any>(),
	warn: jest.fn<(...args: any[]) => any>(),
	error: jest.fn<(...args: any[]) => any>(),
};
jest.mock("@trading-model/contracts/logger-registry", () => ({
	getLogger: () => mockLog,
}));

import {
	REPEATED_FAILURE_LOG_INTERVAL_MS,
	WorkerOrchestrator,
	type WorkerOrchestratorDeps,
} from "../../../src/application/worker-orchestrator";
import {
	CANDLES_PERSISTED_TOTAL,
	SYMBOLS_FAILED_TOTAL,
	SYMBOLS_SCRAPED_TOTAL,
} from "../../../src/config/metrics";
import type { CandleData } from "../../../src/domain/market-data.types";
import type {
	MarketDataSnapshot,
	SnapshotRequest,
} from "../../../src/domain/market-data-snapshot";

const BTC = TradingSymbol.of("BTCUSDT");
const ETH = TradingSymbol.of("ETHUSDT");
const MINUTE = 60_000;

const candleAt = (minute: number, symbol = BTC) =>
	({
		symbol,
		market: MarketType.Crypto,
		timestamp: UnixTimestamp.of(minute * MINUTE),
		closeTimestamp: UnixTimestamp.of((minute + 1) * MINUTE - 1),
	}) as CandleData;

const candlesFrom = (first: number, count: number) =>
	Array.from({ length: count }, (_, index) => candleAt(first + index));

/** MySQL as the scraper sees it: the persisted candles. */
class FakeBacklog {
	readonly candles = new Map<TradingSymbol, Map<number, CandleData>>();
	failReads = false;

	store(snapshot: MarketDataSnapshot): void {
		for (const candle of snapshot.candles ?? []) {
			const series = this.candles.get(candle.symbol) ?? new Map();
			series.set(candle.timestamp, candle);
			this.candles.set(candle.symbol, series);
		}
	}

	async lastCandleOpenTime({ symbol }: { symbol: TradingSymbol }) {
		if (this.failReads) {
			throw new Error("mysql down");
		}
		return [...(this.candles.get(symbol)?.keys() ?? [])]
			.sort((left, right) => left - right)
			.at(-1) as UnixTimestamp | undefined;
	}
}

describe("WorkerOrchestrator", () => {
	let results: MarketDataSnapshot[];
	let steps: string[];
	let backlog: FakeBacklog;
	let fetchSnapshot: jest.Mock<
		(request: SnapshotRequest) => Promise<MarketDataSnapshot>
	>;
	let persist: jest.Mock<(snapshot: MarketDataSnapshot) => Promise<void>>;
	let deps: WorkerOrchestratorDeps;
	let orchestrator: WorkerOrchestrator;

	const newOrchestrator = (symbols = [BTC], concurrency = 1) =>
		new WorkerOrchestrator(
			PositiveInt.of(concurrency),
			symbols,
			CandleInterval.Min1,
			deps
		);

	beforeEach(() => {
		results = [];
		steps = [];
		backlog = new FakeBacklog();
		fetchSnapshot = jest.fn(async (..._args: any[]) => {
			steps.push("fetch");
			return results.shift() ?? { candles: [], fetchedAt: 0 };
		});
		persist = jest.fn(async (snapshot) => {
			steps.push("persist");
			backlog.store(snapshot);
		});
		deps = {
			source: { id: DataSource.Binance, fetchSnapshot },
			persist,
			lastCandleOpenTime: (series) => backlog.lastCandleOpenTime(series),
		};
		SYMBOLS_FAILED_TOTAL.reset();
		SYMBOLS_SCRAPED_TOTAL.reset();
		CANDLES_PERSISTED_TOTAL.reset();
		orchestrator = newOrchestrator();
	});

	/** Value of a per-symbol counter (undefined: no series for that symbol). */
	const symbolCount = async (
		metric: typeof SYMBOLS_FAILED_TOTAL | typeof CANDLES_PERSISTED_TOTAL,
		symbol: TradingSymbol
	): Promise<number | undefined> =>
		(await metric.get()).values.find((v) => v.labels.symbol === symbol)?.value;

	const runCycle = () => orchestrator.executeAll();

	const startTimeOfCall = (call: number) =>
		fetchSnapshot.mock.calls[call][0].candleStartTime;

	it("should fetch from the source, then persist", async () => {
		const snapshot = { candles: [candleAt(1)], fetchedAt: 0 };
		results.push(snapshot);

		await runCycle();

		expect(steps).toEqual(["fetch", "persist"]);
		expect(fetchSnapshot).toHaveBeenCalledWith({
			symbol: BTC,
			interval: CandleInterval.Min1,
			candleStartTime: undefined,
		});
		expect(persist).toHaveBeenCalledWith(snapshot);
	});

	it("should start no step once the cycle is aborted", async () => {
		const controller = new AbortController();
		controller.abort();

		await orchestrator.executeAll(controller.signal);

		expect(steps).toEqual([]);
	});

	it("should not persist when the source fails", async () => {
		fetchSnapshot.mockRejectedValueOnce(new Error("451"));

		await runCycle();

		expect(persist).not.toHaveBeenCalled();
	});

	it("should fetch the latest candles on the first cycle", async () => {
		await runCycle();

		expect(startTimeOfCall(0)).toBeUndefined();
	});

	it("should start the next cycle right after the last persisted candle", async () => {
		results.push({ candles: [candleAt(1), candleAt(2)], fetchedAt: 0 });

		await runCycle();
		await runCycle();

		expect(startTimeOfCall(1)).toBe(3 * MINUTE);
	});

	it("should keep the cursor when a cycle brings no new candle", async () => {
		results.push({ candles: [candleAt(1)], fetchedAt: 0 });
		results.push({ candles: [], fetchedAt: 0 });

		await runCycle();
		await runCycle();
		await runCycle();

		expect(startTimeOfCall(2)).toBe(2 * MINUTE);
	});

	it("should resume a new process at the newest persisted candle", async () => {
		backlog.store({ candles: candlesFrom(0, 300), fetchedAt: 0 });

		await runCycle();

		expect(startTimeOfCall(0)).toBe(299 * MINUTE);
	});

	it("should fetch nothing while MySQL is unreadable, then resume at the stored candle", async () => {
		backlog.store({ candles: [candleAt(5)], fetchedAt: 0 });
		backlog.failReads = true;

		await runCycle();
		backlog.failReads = false;
		await runCycle();

		expect(fetchSnapshot).toHaveBeenCalledTimes(1);
		expect(startTimeOfCall(0)).toBe(5 * MINUTE);
		expect(await symbolCount(SYMBOLS_FAILED_TOTAL, BTC)).toBe(1);
	});

	it("should fetch the same candles again when persistence fails", async () => {
		results.push({ candles: [candleAt(1)], fetchedAt: 0 });
		persist.mockRejectedValueOnce(new Error("mysql down"));

		await runCycle();
		await runCycle();

		expect(startTimeOfCall(1)).toBeUndefined();
	});

	describe("symbol isolation", () => {
		beforeEach(() => {
			orchestrator = newOrchestrator([BTC, ETH], 2);
		});

		it("should still persist the other symbols when one fails to fetch", async () => {
			fetchSnapshot.mockImplementation(async (request) => {
				if (request.symbol === BTC) {
					throw new Error("BTC unavailable");
				}
				return { candles: [candleAt(1, ETH)], fetchedAt: 0 };
			});

			await runCycle();

			expect(persist).toHaveBeenCalledTimes(1);
			expect(await symbolCount(SYMBOLS_FAILED_TOTAL, BTC)).toBe(1);
			expect(await symbolCount(SYMBOLS_FAILED_TOTAL, ETH)).toBe(0);
			expect(await symbolCount(SYMBOLS_SCRAPED_TOTAL, BTC)).toBe(0);
			expect(await symbolCount(SYMBOLS_SCRAPED_TOTAL, ETH)).toBe(1);
		});

		it("should still persist the other symbols when one fails to persist", async () => {
			persist.mockRejectedValueOnce(new Error("mysql deadlock"));

			await runCycle();

			const total = async (metric: typeof SYMBOLS_FAILED_TOTAL) =>
				(await metric.get()).values.reduce((sum, v) => sum + v.value, 0);
			expect(persist).toHaveBeenCalledTimes(2);
			expect(await total(SYMBOLS_FAILED_TOTAL)).toBe(1);
			expect(await total(SYMBOLS_SCRAPED_TOTAL)).toBe(1);
		});

		it("should start every symbol's counters at 0 before any cycle", async () => {
			for (const symbol of [BTC, ETH]) {
				expect(await symbolCount(SYMBOLS_FAILED_TOTAL, symbol)).toBe(0);
				expect(await symbolCount(SYMBOLS_SCRAPED_TOTAL, symbol)).toBe(0);
				expect(await symbolCount(CANDLES_PERSISTED_TOTAL, symbol)).toBe(0);
			}
		});
	});

	describe("repeated failures", () => {
		let now: number;
		beforeEach(() => {
			now = 1_000;
			jest.spyOn(Date, "now").mockImplementation(() => now);
			for (const fn of Object.values(mockLog)) {
				fn.mockClear();
			}
		});

		it("should log the stack once, then a summary without stack, then the recovery", async () => {
			fetchSnapshot.mockRejectedValue(new RangeError("got 0"));
			await runCycle();
			await runCycle();
			await runCycle();
			expect(mockLog.error).toHaveBeenCalledTimes(1);
			expect(mockLog.error.mock.calls[0]?.[1]).toHaveProperty("error");

			now += REPEATED_FAILURE_LOG_INTERVAL_MS;
			await runCycle();
			expect(mockLog.error).toHaveBeenCalledTimes(2);
			expect(mockLog.error.mock.calls[1]?.[1]).not.toHaveProperty("error");
			expect(await symbolCount(SYMBOLS_FAILED_TOTAL, BTC)).toBe(4);

			fetchSnapshot.mockResolvedValue({ candles: [], fetchedAt: 0 });
			await runCycle();
			expect(mockLog.info).toHaveBeenCalledTimes(1);
		});

		it("should log a new stack when the error changes", async () => {
			fetchSnapshot.mockRejectedValueOnce(new Error("a"));
			fetchSnapshot.mockRejectedValueOnce(new Error("b"));
			await runCycle();
			await runCycle();
			expect(mockLog.error).toHaveBeenCalledTimes(2);
		});
	});
});
