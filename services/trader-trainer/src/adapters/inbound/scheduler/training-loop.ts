import { normalizeError } from "@trading-model/common/utils/errors";
import { TimerHandle } from "@trading-model/common/utils/timer-handle";
import { getLogger } from "@trading-model/contracts/logger-registry";
import { DurationMs } from "@trading-model/primitives/primitives";
import type { Trainer } from "../../../application/trainer";
import type { MarketDataBuffer } from "../../../domain/market-data-buffer";
import type { TradingSymbol } from "../../../domain/market-data-types";

const MIN_CANDLE_RATIO = 0.1;

export interface TrainingLoopConfig {
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

	constructor(
		private readonly _trainer: Trainer,
		private readonly _dataBuffer: MarketDataBuffer
	) {}

	start(config: TrainingLoopConfig): void {
		const { symbols, intervalMs, maxDataAgeMs } = config;
		const runTraining = (): void => {
			this._runTrainingForSymbols(symbols, maxDataAgeMs).catch((err) => {
				getLogger().error("Training cycle failed", {
					error: normalizeError(err).message,
				});
			});
		};

		runTraining();
		this._trainingInterval.startInterval(
			runTraining,
			DurationMs.of(intervalMs)
		);
	}

	private _hasEnoughData(symbol: TradingSymbol): boolean {
		return (
			this._dataBuffer.getCandleCount(symbol) >=
			this._dataBuffer.getMaxSize() * MIN_CANDLE_RATIO
		);
	}

	private _hasFreshData(symbol: TradingSymbol, maxDataAgeMs: number): boolean {
		const lastClose = this._dataBuffer.getLastCandleCloseTime(symbol);
		const ageMs =
			lastClose === undefined
				? Number.POSITIVE_INFINITY
				: Date.now() - lastClose;
		const fresh = ageMs <= maxDataAgeMs;
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
		if (this._trainer.isTraining()) {
			return;
		}
		for (let offset = 0; offset < symbols.length; offset++) {
			const index = (this._nextIndex + offset) % symbols.length;
			const symbol = symbols[index];
			if (
				this._hasEnoughData(symbol) &&
				this._hasFreshData(symbol, maxDataAgeMs)
			) {
				// Advance before training: a rejected train() still passes the turn.
				this._nextIndex = (index + 1) % symbols.length;
				await this._trainer.train(symbol);
				return;
			}
		}
	}

	stop(): void {
		this._trainingInterval.stop();
	}
}
