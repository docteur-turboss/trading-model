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
	jest.fn(() => (fn: (...args: unknown[]) => unknown) => fn())
);

jest.mock("@trading-model/contracts/logger-registry", () => ({
	getLogger: () => ({ debug: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

import {
	MAX_CANDLES_PER_PUBLISH,
	WorkerOrchestrator,
	type WorkerOrchestratorDeps,
} from "../../../../src/application/worker-orchestrator";
import {
	PUBLISHES_SKIPPED_TOTAL,
	SYMBOLS_FAILED_TOTAL,
	SYMBOLS_SCRAPED_TOTAL,
	UNPUBLISHED_CANDLES,
} from "../../../../src/config/metrics";
import type { CandleData } from "../../../../src/domain/market-data.types";
import type {
	MarketDataSnapshot,
	SnapshotPart,
	SnapshotRequest,
} from "../../../../src/domain/market-data-snapshot";
import type {
	CandlePublishBacklogPort,
	PublishCursor,
} from "../../../../src/domain/ports/candle-publish-backlog.port";

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

const metricValue = async (
	metric: { get(): Promise<{ values: { value: number }[] }> },
	index = 0
): Promise<number> => (await metric.get()).values[index]?.value ?? 0;

/** MySQL as the backlog sees it: the persisted candles and the cursors. */
class FakeBacklog implements CandlePublishBacklogPort {
	readonly candles = new Map<TradingSymbol, Map<number, CandleData>>();
	readonly cursors = new Map<TradingSymbol, PublishCursor>();
	failReads = false;

	store(snapshot: MarketDataSnapshot): void {
		for (const candle of snapshot.candles ?? []) {
			const series = this.candles.get(candle.symbol) ?? new Map();
			series.set(candle.timestamp, candle);
			this.candles.set(candle.symbol, series);
		}
	}

	async cursor({ symbol }: { symbol: TradingSymbol }) {
		this._maybeFail();
		return this.cursors.get(symbol);
	}

	async saveCursor(
		{ symbol }: { symbol: TradingSymbol },
		cursor: PublishCursor
	) {
		this.cursors.set(symbol, cursor);
	}

	async candlesFrom(
		{ symbol }: { symbol: TradingSymbol },
		cursor: PublishCursor,
		limit: number
	) {
		this._maybeFail();
		return this._from(symbol, cursor).slice(0, limit);
	}

	async countFrom(
		{ symbol }: { symbol: TradingSymbol },
		cursor: PublishCursor
	) {
		return this._from(symbol, cursor).length;
	}

	private _from(symbol: TradingSymbol, cursor: PublishCursor): CandleData[] {
		return [...(this.candles.get(symbol)?.values() ?? [])]
			.filter((candle) => candle.timestamp >= cursor.publishedUntil)
			.sort((left, right) => left.timestamp - right.timestamp);
	}

	private _maybeFail(): void {
		if (this.failReads) {
			throw new Error("mysql down");
		}
	}
}

describe("WorkerOrchestrator", () => {
	let results: MarketDataSnapshot[];
	let steps: string[];
	let backlog: FakeBacklog;
	let fetchSnapshot: jest.Mock<
		(request: SnapshotRequest) => Promise<MarketDataSnapshot>
	>;
	let publish: jest.Mock<
		(snapshot: MarketDataSnapshot) => Promise<SnapshotPart[]>
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
		fetchSnapshot = jest.fn(async () => {
			steps.push("fetch");
			return results.shift() ?? { candles: [], fetchedAt: 0 };
		});
		publish = jest.fn(async () => {
			steps.push("publish");
			return [];
		});
		persist = jest.fn(async (snapshot) => {
			steps.push("persist");
			backlog.store(snapshot);
		});
		deps = {
			source: { id: DataSource.Binance, fetchSnapshot },
			publisher: { publish },
			persist,
			backlog,
		};
		SYMBOLS_FAILED_TOTAL.reset();
		SYMBOLS_SCRAPED_TOTAL.reset();
		PUBLISHES_SKIPPED_TOTAL.reset();
		UNPUBLISHED_CANDLES.reset();
		orchestrator = newOrchestrator();
	});

	/** Value of a per-symbol counter (undefined: no series for that symbol). */
	const symbolCount = async (
		metric: typeof SYMBOLS_FAILED_TOTAL,
		symbol: TradingSymbol
	): Promise<number | undefined> =>
		(await metric.get()).values.find((v) => v.labels.symbol === symbol)?.value;

	/** One cycle and the publishes it started. */
	const runCycle = async () => {
		await orchestrator.executeAll();
		await orchestrator.drain();
	};

	const startTimeOfCall = (call: number) =>
		fetchSnapshot.mock.calls[call][0].candleStartTime;

	const publishedCandles = (call: number) =>
		publish.mock.calls[call][0].candles;

	/** A publish that waits for `release`. */
	const hangNextPublish = () => {
		const hung: { release: (failed: SnapshotPart[]) => void } = {
			release: () => undefined,
		};
		publish.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					hung.release = resolve;
				})
		);
		return hung;
	};

	it("should fetch from the source, persist, then publish the persisted candles", async () => {
		const snapshot = { candles: [candleAt(1)], fetchedAt: 0 };
		results.push(snapshot);

		await runCycle();

		expect(steps).toEqual(["fetch", "persist", "publish"]);
		expect(fetchSnapshot).toHaveBeenCalledWith({
			symbol: BTC,
			interval: CandleInterval.Min1,
			candleStartTime: undefined,
		});
		expect(persist).toHaveBeenCalledWith(snapshot);
		expect(publish).toHaveBeenCalledWith(snapshot);
	});

	it("should neither publish nor persist when the source fails", async () => {
		fetchSnapshot.mockRejectedValueOnce(new Error("451"));

		await runCycle();

		expect(publish).not.toHaveBeenCalled();
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

		it("should still persist and publish the other symbols when one fails to fetch", async () => {
			fetchSnapshot.mockImplementation(async (request) => {
				if (request.symbol === BTC) {
					throw new Error("BTC unavailable");
				}
				return { candles: [candleAt(1, ETH)], fetchedAt: 0 };
			});

			await runCycle();

			expect(persist).toHaveBeenCalledTimes(1);
			expect(publish).toHaveBeenCalledTimes(1);
			expect(publishedCandles(0)).toEqual([candleAt(1, ETH)]);
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
			}
		});
	});

	describe("publishing", () => {
		it("should start a series without cursor at its first persisted candle, not at the history", async () => {
			backlog.store({ candles: [candleAt(0)], fetchedAt: 0 });
			results.push({ candles: [candleAt(1)], fetchedAt: 0 });

			await runCycle();

			expect(publishedCandles(0)).toEqual([candleAt(1)]);
			expect(backlog.cursors.get(BTC)?.publishedUntil).toBe(MINUTE + 1);
		});

		it("should persist without waiting for a publish that hangs", async () => {
			const hung = hangNextPublish();
			results.push({ candles: [candleAt(1)], fetchedAt: 0 });
			results.push({ candles: [candleAt(2)], fetchedAt: 0 });

			await orchestrator.executeAll();
			await orchestrator.executeAll();

			expect(persist).toHaveBeenCalledTimes(2);
			expect(publish).toHaveBeenCalledTimes(1);
			expect(await metricValue(PUBLISHES_SKIPPED_TOTAL)).toBe(1);

			hung.release([]);
			await orchestrator.drain();
			await runCycle();

			// The candle persisted while the bus hung goes out afterwards.
			expect(publishedCandles(1)).toEqual([candleAt(2)]);
			expect(await metricValue(UNPUBLISHED_CANDLES)).toBe(0);
		});

		it("should send the candles again when their publish failed", async () => {
			results.push({ candles: [candleAt(1)], fetchedAt: 0 });
			results.push({ candles: [candleAt(2)], fetchedAt: 0 });
			publish.mockResolvedValueOnce(["candles"]);

			await runCycle();
			expect(await metricValue(UNPUBLISHED_CANDLES)).toBe(1);
			await runCycle();
			await runCycle();

			expect(publishedCandles(1)).toEqual([candleAt(1), candleAt(2)]);
			expect(publishedCandles(2)).toEqual([]);
		});

		it("should not send the candles again when only another part failed", async () => {
			results.push({ candles: [candleAt(1)], fetchedAt: 0 });
			publish.mockResolvedValueOnce(["orderBook"]);

			await runCycle();
			await runCycle();

			expect(publishedCandles(1)).toEqual([]);
		});

		it("should resume from the saved cursor after a restart", async () => {
			results.push({ candles: [candleAt(1)], fetchedAt: 0 });
			results.push({ candles: [candleAt(2)], fetchedAt: 0 });
			results.push({ candles: [candleAt(3)], fetchedAt: 0 });
			publish.mockResolvedValueOnce([]).mockResolvedValueOnce(["candles"]);

			await runCycle();
			await runCycle();
			orchestrator = newOrchestrator();
			await runCycle();

			// candle 2 never reached the bus: the new process sends it first.
			expect(publishedCandles(2)).toEqual([candleAt(2), candleAt(3)]);
		});

		it("should still publish when persistence fails, without the unpersisted candles", async () => {
			results.push({ candles: [candleAt(1)], fetchedAt: 0 });
			results.push({ candles: [candleAt(1)], fetchedAt: 0 });
			persist.mockRejectedValueOnce(new Error("mysql down"));

			await runCycle();
			await runCycle();

			expect(publishedCandles(0)).toEqual([]);
			expect(publishedCandles(1)).toEqual([candleAt(1)]);
		});

		it("should publish the other parts when the backlog is unreadable", async () => {
			results.push({ candles: [candleAt(1)], recentTrades: [], fetchedAt: 0 });
			backlog.failReads = true;

			await runCycle();

			expect(publish).toHaveBeenCalledTimes(1);
			expect(publishedCandles(0)).toBeUndefined();
			expect(publish.mock.calls[0][0].recentTrades).toEqual([]);
		});

		it("should leave the candle part out when candles were not fetched", async () => {
			results.push({ recentTrades: [], fetchedAt: 0 });

			await runCycle();

			expect(publishedCandles(0)).toBeUndefined();
		});

		it("should send a backlog in batches of one fetch window", async () => {
			const many = candlesFrom(0, MAX_CANDLES_PER_PUBLISH + 5);
			results.push({ candles: many, fetchedAt: 0 });
			publish.mockResolvedValueOnce(["candles"]);

			await runCycle();
			await runCycle();
			await runCycle();

			expect(publishedCandles(1)).toEqual(
				many.slice(0, MAX_CANDLES_PER_PUBLISH)
			);
			expect(publishedCandles(2)).toEqual(many.slice(MAX_CANDLES_PER_PUBLISH));
		});

		it("should resolve drain only once the publishes in flight are done", async () => {
			const hung = hangNextPublish();
			let drained = false;

			await orchestrator.executeAll();
			const drain = orchestrator.drain().then(() => {
				drained = true;
			});
			await Promise.resolve();
			expect(drained).toBe(false);

			hung.release([]);
			await drain;
			expect(drained).toBe(true);
		});
	});
});
