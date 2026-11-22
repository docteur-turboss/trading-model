import { getLogger } from "@trading-model/contracts/logger-registry";
import type { CandleInterval } from "@trading-model/contracts/market-data.types";
import {
	type DataSource,
	type PositiveInt,
	type TradingSymbol,
	UnixTimestamp,
} from "@trading-model/primitives/primitives";
import {
	CANDLES_PERSISTED_TOTAL,
	SYMBOLS_FAILED_TOTAL,
	SYMBOLS_SCRAPED_TOTAL,
} from "../config/metrics";
import type { MarketDataSnapshot } from "../domain/market-data-snapshot";
import type { MarketDataSourcePort } from "../domain/ports/market-data-source.port";

/** A candle series: one symbol and interval from one source. */
export interface CandleSeries {
	source: DataSource;
	symbol: TradingSymbol;
	interval: CandleInterval;
}

/** One scrape of a symbol: fetch from the source, then persist (wired by config/container.ts). */
export interface WorkerOrchestratorDeps {
	source: MarketDataSourcePort;
	persist(snapshot: MarketDataSnapshot): Promise<void>;
	/** Open time of the newest persisted candle of the series (undefined: none). */
	lastCandleOpenTime(series: CandleSeries): Promise<UnixTimestamp | undefined>;
}

type LimitFunction = <TArgs extends unknown[], TResult>(
	fn: (...args: TArgs) => PromiseLike<TResult> | TResult,
	...args: TArgs
) => Promise<TResult>;

interface SymbolState {
	/** Open time of the next candle to fetch. */
	cursor?: UnixTimestamp;
	/** Fetch cursor read from the newest persisted candle (once per process). */
	cursorLoaded: boolean;
	/** Run of identical scrape failures in progress (absent: last cycle succeeded). */
	failure?: { signature: string; repeats: number; lastLoggedAt: number };
}

/** Minimum gap between two summary lines of the same repeated failure. */
export const REPEATED_FAILURE_LOG_INTERVAL_MS = 15 * 60_000;

/**
 * Runs the scrape of every tracked symbol. Each symbol is isolated: its
 * failure is logged and counted, the others go on.
 *
 * The fetch resumes at the newest persisted candle, so a restart loses none.
 */
export class WorkerOrchestrator {
	private readonly _maxConcurrency: PositiveInt;
	private readonly _states = new Map<TradingSymbol, SymbolState>();

	constructor(
		maxConcurrency: PositiveInt,
		private readonly _symbols: TradingSymbol[],
		private readonly _candleInterval: CandleInterval,
		private readonly _deps: WorkerOrchestratorDeps
	) {
		this._maxConcurrency = maxConcurrency;
		// Series at 0 from the start: increase() then sees the first failure,
		// and a symbol that never persists a candle (SymbolMarketDataStale).
		for (const symbol of _symbols) {
			CANDLES_PERSISTED_TOTAL.inc({ symbol }, 0);
			SYMBOLS_FAILED_TOTAL.inc({ symbol }, 0);
			SYMBOLS_SCRAPED_TOTAL.inc({ symbol }, 0);
		}
	}

	/**
	 * Once `signal` fires (lease lost), no symbol starts another step: at most
	 * the requests already in flight finish.
	 */
	async executeAll(signal?: AbortSignal): Promise<void> {
		this._deps.source.beginCycle?.(this._symbols, signal);
		const limiter = await _createLimiter(this._maxConcurrency);

		const settled = await Promise.allSettled(
			this._symbols.map((symbol) => limiter(() => this._scrape(symbol, signal)))
		);

		if (signal?.aborted) {
			return; // Aborted symbols are not failures.
		}

		settled.forEach((outcome, index) => {
			const symbol = this._symbols[index];
			if (outcome.status === "rejected") {
				this._logFailure(symbol, outcome.reason);
				SYMBOLS_FAILED_TOTAL.inc({ symbol });
			} else {
				this._logRecovery(symbol);
				SYMBOLS_SCRAPED_TOTAL.inc({ symbol });
			}
		});
	}

	/**
	 * Full ERROR with stack on a new failure; the same failure again is
	 * summarized without stack at most every REPEATED_FAILURE_LOG_INTERVAL_MS.
	 */
	private _logFailure(symbol: TradingSymbol, reason: unknown): void {
		const state = this._stateOf(symbol);
		const context = { source: this._deps.source.id, symbol };
		const now = Date.now();
		const signature =
			reason instanceof Error
				? `${reason.name}: ${reason.message}`
				: String(reason);
		if (state.failure?.signature !== signature) {
			state.failure = { signature, repeats: 0, lastLoggedAt: now };
			getLogger().error("Symbol scrape failed", { context, error: reason });
			return;
		}
		state.failure.repeats++;
		if (now - state.failure.lastLoggedAt >= REPEATED_FAILURE_LOG_INTERVAL_MS) {
			state.failure.lastLoggedAt = now;
			getLogger().error("Symbol scrape still failing", {
				context: { ...context, signature, repeats: state.failure.repeats },
			});
		}
	}

	private _logRecovery(symbol: TradingSymbol): void {
		const state = this._stateOf(symbol);
		if (state.failure) {
			getLogger().info("Symbol scrape recovered", {
				context: {
					source: this._deps.source.id,
					symbol,
					signature: state.failure.signature,
					repeats: state.failure.repeats,
				},
			});
			state.failure = undefined;
		}
	}

	private async _scrape(
		symbol: TradingSymbol,
		signal?: AbortSignal
	): Promise<void> {
		const state = this._stateOf(symbol);
		signal?.throwIfAborted();
		await this._loadCursor(symbol, state);
		signal?.throwIfAborted();
		const snapshot = await this._deps.source.fetchSnapshot({
			symbol,
			interval: this._candleInterval,
			candleStartTime: state.cursor,
			signal,
		});

		signal?.throwIfAborted();
		await this._deps.persist(snapshot);
		getLogger().debug("Data persisted");
		// Moves past the last persisted candle; a failed cycle is fetched again.
		this._advanceCursor(state, snapshot);
	}

	private _stateOf(symbol: TradingSymbol): SymbolState {
		let state = this._states.get(symbol);
		if (!state) {
			state = { cursorLoaded: false };
			this._states.set(symbol, state);
		}
		return state;
	}

	private _seriesOf(symbol: TradingSymbol): CandleSeries {
		return {
			source: this._deps.source.id,
			symbol,
			interval: this._candleInterval,
		};
	}

	/**
	 * Resumes the fetch at the newest persisted candle, so a stop longer than
	 * one fetch window leaves no gap. Unreadable: the cycle fails (logged by
	 * `executeAll`) and nothing is fetched or persisted, since a fallback fetch
	 * would store candles past the gap and hide it from the next read.
	 */
	private async _loadCursor(
		symbol: TradingSymbol,
		state: SymbolState
	): Promise<void> {
		if (state.cursorLoaded) {
			return;
		}
		// Its open time, not close + 1: the newest candle may have been stored
		// still open; fetching it again is an idempotent upsert.
		state.cursor = await this._deps.lastCandleOpenTime(this._seriesOf(symbol));
		state.cursorLoaded = true;
	}

	private _advanceCursor(
		state: SymbolState,
		snapshot: MarketDataSnapshot
	): void {
		const candles = snapshot.candles ?? [];
		const last = candles[candles.length - 1];
		if (last) {
			state.cursor = UnixTimestamp.of(last.closeTimestamp + 1);
		}
	}
}

async function _createLimiter(
	maxConcurrency: PositiveInt
): Promise<LimitFunction> {
	// as unknown as: dynamic ESM import of p-limit has no CJS typing
	const { default: pLimit } = (await import("p-limit")) as unknown as {
		default: (concurrency: number) => LimitFunction;
	};
	return pLimit(maxConcurrency);
}
