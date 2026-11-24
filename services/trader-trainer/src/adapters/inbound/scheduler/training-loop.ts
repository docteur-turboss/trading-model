import { normalizeError } from "@trading-model/common/utils/errors";
import { TimerHandle } from "@trading-model/common/utils/timer-handle";
import { getLogger } from "@trading-model/contracts/logger-registry";
import { Dimension } from "@trading-model/contracts/wire/signals";
import { runJob } from "@trading-model/http/correlation-id";
import { DurationMs } from "@trading-model/primitives/primitives";
import type { Trainer } from "../../../application/trainer";
import {
	LAST_CANDLE_AGE_SECONDS,
	SIGNAL_NEWEST_AGE_SECONDS,
	SIGNAL_READ_ERRORS_TOTAL,
	SIGNAL_WINDOW_SIZE,
} from "../../../config/metrics";
import { hasEnoughTrainingData } from "../../../domain/market-data/window-splitter";
import type { MarketDataBuffer } from "../../../domain/market-data-buffer";
import {
	DAILY_MAX_DATA_AGE_MS,
	type TradingSymbol,
} from "../../../domain/market-data-types";
import type { CandleHistoryPort } from "../../../domain/ports/candle-history.port";
import type { SignalHistoryPort } from "../../../domain/ports/signal-history.port";
import { signalKey } from "../../../domain/signal-features";

interface TrainingLoopConfig {
	symbols: TradingSymbol[];
	intervalMs: number;
	/**
	 * A symbol whose newest candle closed longer ago is not trained: during a
	 * market data outage the buffer only holds old candles (ADR-0026).
	 */
	maxDataAgeMs: number;
}

export class TrainingLoop {
	private readonly _trainingInterval = new TimerHandle();
	private readonly _staleSymbols = new Set<TradingSymbol>();
	/** Position in the symbol list where the next cycle starts its scan. */
	private _nextIndex = 0;
	/** Close of the newest bar each daily symbol was trained on: a series that changes once a day is not retrained before its next bar. */
	private readonly _trainedBar = new Map<TradingSymbol, number>();

	constructor(
		private readonly _trainer: Trainer,
		private readonly _dataBuffer: MarketDataBuffer,
		private readonly _history: CandleHistoryPort,
		private readonly _windowing: {
			validationSplit: number;
			walkForwardFolds: number;
			testSplit: number;
		},
		/** Symbol to asset: only these symbols have their signal window read. */
		private readonly _signals?: {
			history: SignalHistoryPort;
			assets: ReadonlyMap<TradingSymbol, string>;
			windowMs: number;
		},
		/** Symbols on daily bars: their freshness and cadence follow the series (ADR-0083). */
		private readonly _daily: ReadonlySet<TradingSymbol> = new Set(),
		/** FEATURE_SHARED_TRUNK: symbols trained together in one session; absent: one symbol per session. */
		private readonly _sharedTrunk?: readonly TradingSymbol[]
	) {}

	start(config: TrainingLoopConfig): void {
		const { symbols, intervalMs, maxDataAgeMs } = config;
		const runTraining = (): void => {
			// biome-ignore lint/plugin: logged by onError, inside the job context
			runJob(
				"trader-trainer.training-cycle",
				() => this._runTrainingForSymbols(symbols, maxDataAgeMs),
				(err) =>
					getLogger().error("Training cycle failed", {
						error: normalizeError(err).message,
					})
			).catch(() => undefined);
		};

		runTraining();
		this._trainingInterval.startInterval(
			runTraining,
			DurationMs.of(intervalMs)
		);
	}

	/**
	 * The dataset is the stored window ending now, not what the bus delivered
	 * since this pod started (ADR-0044). False when it cannot be read.
	 */
	private async _loadStoredCandles(symbol: TradingSymbol): Promise<boolean> {
		try {
			this._dataBuffer.replaceCandles(
				symbol,
				await this._history.loadWindow(
					symbol,
					Date.now(),
					this._dataBuffer.getMaxSize()
				)
			);
			return true;
		} catch (err) {
			getLogger().error("Stored candles unreadable: symbol skipped", {
				context: { symbol },
				error: normalizeError(err).message,
			});
			return false;
		}
	}

	/**
	 * Measures the signals a session could use and hands them to the buffer,
	 * which builds the network's signal inputs from them (FEATURE_SIGNAL_INPUTS).
	 * A failed read is counted and the session goes on without them.
	 */
	private async _observeSignals(symbol: TradingSymbol): Promise<void> {
		const assetId = this._signals?.assets.get(symbol);
		if (!(this._signals && assetId)) {
			return;
		}
		const now = Date.now();
		try {
			const signals = await this._signals.history.loadWindow(
				assetId,
				now - this._signals.windowMs,
				now
			);
			this._dataBuffer.setSignals(symbol, signals);
			const found = new Set(signals.map(signalKey));
			const missing = this._dataBuffer.signalKeys.filter(
				(key) => !found.has(key)
			);
			if (missing.length > 0) {
				getLogger().warn("Configured signal keys found no signal: zeros", {
					context: { symbol, assetId, keys: missing },
				});
			}
			for (const dimension of Dimension.options) {
				const labels = { symbol, dimension };
				const observed = signals
					.filter((signal) => signal.dimension === dimension)
					.map((signal) => Date.parse(signal.observedAt));
				SIGNAL_WINDOW_SIZE.set(labels, observed.length);
				if (observed.length > 0) {
					SIGNAL_NEWEST_AGE_SECONDS.set(
						labels,
						(now - Math.max(...observed)) / 1000
					);
				} else {
					SIGNAL_NEWEST_AGE_SECONDS.remove(labels);
				}
			}
			getLogger().info("Signal window read", {
				context: { symbol, assetId, signals: signals.length },
			});
		} catch (err) {
			SIGNAL_READ_ERRORS_TOTAL.inc({ symbol });
			this._dataBuffer.setSignals(symbol, []);
			getLogger().error("Signals unreadable: session trains without them", {
				context: { symbol, assetId },
				error: normalizeError(err).message,
			});
		}
	}

	private _hasEnoughData(symbol: TradingSymbol): boolean {
		return hasEnoughTrainingData(
			this._dataBuffer.getCandleCount(symbol),
			this._windowing.validationSplit,
			this._windowing.walkForwardFolds,
			this._windowing.testSplit
		);
	}

	private _isTrainedOnNewestBar(symbol: TradingSymbol): boolean {
		return (
			this._daily.has(symbol) &&
			this._trainedBar.get(symbol) ===
				this._dataBuffer.getLastCandleCloseTime(symbol)
		);
	}

	private _hasFreshData(symbol: TradingSymbol, maxDataAgeMs: number): boolean {
		const lastClose = this._dataBuffer.getLastCandleCloseTime(symbol);
		const ageMs =
			lastClose === undefined
				? Number.POSITIVE_INFINITY
				: Date.now() - lastClose;
		LAST_CANDLE_AGE_SECONDS.set({ symbol }, ageMs / 1000);
		const fresh =
			ageMs <= (this._daily.has(symbol) ? DAILY_MAX_DATA_AGE_MS : maxDataAgeMs);
		this._reportFreshnessChange(symbol, fresh, lastClose);
		return fresh;
	}

	/** Logs only transitions, not every cycle of a long outage. */
	private _reportFreshnessChange(
		symbol: TradingSymbol,
		fresh: boolean,
		lastClose: number | undefined
	): void {
		const wasStale = this._staleSymbols.has(symbol);
		if (!(fresh || wasStale)) {
			this._staleSymbols.add(symbol);
			getLogger().warn("Market data is stale: training paused", {
				context: { symbol, lastCandleClose: lastClose },
			});
		} else if (fresh && wasStale) {
			this._staleSymbols.delete(symbol);
			getLogger().info("Market data is fresh again: training resumed", {
				context: { symbol },
			});
		}
	}

	/**
	 * Trains one eligible symbol per cycle, round-robin: the scan starts after
	 * the last symbol trained, so every eligible symbol gets its turn and one
	 * that keeps failing cannot hold the loop.
	 */
	private async _runTrainingForSymbols(
		symbols: TradingSymbol[],
		maxDataAgeMs: number
	): Promise<void> {
		// Not awaited: a slow bus must not delay the cycle; republishPending never rejects.
		void this._trainer.republishPending();
		if (this._trainer.isTraining()) {
			return;
		}
		for (let offset = 0; offset < symbols.length; offset++) {
			const index = (this._nextIndex + offset) % symbols.length;
			const symbol = symbols[index];
			if (
				(await this._loadStoredCandles(symbol)) &&
				this._isReady(symbol, maxDataAgeMs)
			) {
				// Advance before training: a rejected train() still passes the turn.
				this._nextIndex = (index + 1) % symbols.length;
				await this._trainReady(symbol, maxDataAgeMs);
				return;
			}
		}
	}

	/** Trains `symbol`, with the eligible symbols of its group under FEATURE_SHARED_TRUNK. */
	private async _trainReady(
		symbol: TradingSymbol,
		maxDataAgeMs: number
	): Promise<void> {
		const group = this._sharedTrunk?.includes(symbol)
			? await this._eligibleGroup(symbol, maxDataAgeMs)
			: [symbol];
		const observed = group
			.filter((member) => this._signals?.assets.has(member))
			.map((member) => this._observeSignals(member));
		// No await without a signal: an extra tick would let stop() overtake train().
		if (observed.length > 0) {
			await Promise.all(observed);
		}
		const bars = group.map((member) =>
			this._dataBuffer.getLastCandleCloseTime(member)
		);
		const result =
			group.length > 1
				? await this._trainer.trainGroup(group)
				: await this._trainer.train(symbol);
		for (const [i, member] of group.entries()) {
			if (this._daily.has(member) && result.success && bars[i] !== undefined) {
				this._trainedBar.set(member, bars[i] as number);
			}
		}
	}

	private _isReady(symbol: TradingSymbol, maxDataAgeMs: number): boolean {
		return (
			this._hasEnoughData(symbol) &&
			this._hasFreshData(symbol, maxDataAgeMs) &&
			!this._isTrainedOnNewestBar(symbol)
		);
	}

	/** `symbol` and the other eligible symbols of its shared-trunk group. */
	private async _eligibleGroup(
		symbol: TradingSymbol,
		maxDataAgeMs: number
	): Promise<TradingSymbol[]> {
		const others = (this._sharedTrunk ?? []).filter(
			(member) => member !== symbol
		);
		const loaded = await Promise.all(
			others.map((other) => this._loadStoredCandles(other))
		);
		return [
			symbol,
			...others.filter(
				(other, index) => loaded[index] && this._isReady(other, maxDataAgeMs)
			),
		];
	}

	/**
	 * Stops scheduling, then ends the session in flight early and waits until
	 * its model is stored and published (ADR-0058).
	 */
	async stop(): Promise<void> {
		this._trainingInterval.stop();
		await this._trainer.stopTraining();
	}
}
