import { getLogger } from "@trading-model/contracts/logger-registry";
import type { CandleInterval } from "@trading-model/contracts/market-data.types";
import {
	type PositiveInt,
	type TradingSymbol,
	UnixTimestamp,
} from "@trading-model/primitives/primitives";
import {
	PUBLISHES_SKIPPED_TOTAL,
	SYMBOLS_FAILED_TOTAL,
	SYMBOLS_SCRAPED_TOTAL,
	UNPUBLISHED_CANDLES,
} from "../config/metrics";
import type { CandleData } from "../domain/market-data.types";
import type { MarketDataSnapshot } from "../domain/market-data-snapshot";
import type {
	CandlePublishBacklogPort,
	CandleSeries,
	PublishCursor,
} from "../domain/ports/candle-publish-backlog.port";
import type { MarketDataPublisherPort } from "../domain/ports/market-data-publisher.port";
import type { MarketDataSourcePort } from "../domain/ports/market-data-source.port";

/**
 * One scrape of a symbol: fetch from the source, persist, then publish the
 * next persisted candles of the backlog (wired by config/container.ts).
 */
export interface WorkerOrchestratorDeps {
	source: MarketDataSourcePort;
	publisher: MarketDataPublisherPort;
	persist(snapshot: MarketDataSnapshot): Promise<void>;
	backlog: CandlePublishBacklogPort;
}

/** Candles per publish, so a backlog drains in messages of one fetch window. */
export const MAX_CANDLES_PER_PUBLISH = 100;

type LimitFunction = <TArgs extends unknown[], TResult>(
	fn: (...args: TArgs) => PromiseLike<TResult> | TResult,
	...args: TArgs
) => Promise<TResult>;

interface SymbolState {
	/** Open time of the next candle to fetch. */
	cursor?: UnixTimestamp;
	/** Publish cursor of the series, read from the backlog once per process. */
	publish?: PublishCursor;
	publishLoaded: boolean;
	/** Publish in flight: the next ones wait for it. */
	publishing?: Promise<void>;
}

/** The next candles to publish, from `cursor` (absent: nothing queued yet). */
interface NextCandles {
	cursor?: PublishCursor;
	batch: CandleData[];
}

/**
 * Runs the scrape of every tracked symbol. Each symbol is isolated: its
 * failure is logged and counted, the others go on.
 *
 * MySQL does not wait for the bus: a cycle persists, then starts the publish
 * without awaiting it (a hung message-manager may hold a publish for
 * PUBLISH_TIMEOUT_MS). While a symbol's publish is in flight, the next cycles
 * only persist. The candles to publish are read back from MySQL from the
 * series publish cursor, which moves only once a publish of theirs succeeded:
 * a bus outage or a scraper restart loses none of them. A series without a
 * cursor starts at the first candle this process persists, not at the history.
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
	}

	async executeAll(): Promise<void> {
		const limiter = await _createLimiter(this._maxConcurrency);

		const settled = await Promise.allSettled(
			this._symbols.map((symbol) => limiter(() => this._scrape(symbol)))
		);

		settled.forEach((outcome, index) => {
			if (outcome.status === "rejected") {
				getLogger().error("Symbol scrape failed", {
					context: {
						source: this._deps.source.id,
						symbol: this._symbols[index],
					},
					error: outcome.reason,
				});
				SYMBOLS_FAILED_TOTAL.inc();
			} else {
				SYMBOLS_SCRAPED_TOTAL.inc();
			}
		});
	}

	/** Waits for the publishes in flight (shutdown, tests). */
	async drain(): Promise<void> {
		await Promise.all(
			[...this._states.values()].map((state) => state.publishing)
		);
	}

	private async _scrape(symbol: TradingSymbol): Promise<void> {
		const state = this._stateOf(symbol);
		const snapshot = await this._deps.source.fetchSnapshot({
			symbol,
			interval: this._candleInterval,
			candleStartTime: state.cursor,
		});

		let persisted = false;
		try {
			await this._deps.persist(snapshot);
			persisted = true;
			getLogger().debug("Data persisted");
			// Moves past the last persisted candle; a failed cycle is fetched again.
			this._advanceCursor(state, snapshot);
		} finally {
			// Published even when MySQL failed: the bus does not wait for it either.
			this._publish(symbol, state, snapshot, persisted);
		}
	}

	private _stateOf(symbol: TradingSymbol): SymbolState {
		let state = this._states.get(symbol);
		if (!state) {
			state = { publishLoaded: false };
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

	/**
	 * Starts the publish of this cycle's data with the next persisted candles,
	 * unless one is in flight. Not awaited by the cycle; never rejects.
	 */
	private _publish(
		symbol: TradingSymbol,
		state: SymbolState,
		snapshot: MarketDataSnapshot,
		persisted: boolean
	): void {
		if (state.publishing !== undefined) {
			PUBLISHES_SKIPPED_TOTAL.inc();
			getLogger().warn("Previous publish still in flight: skipped", {
				context: { symbol },
			});
			void this._refreshBacklogGauge(symbol, state);
			return;
		}

		state.publishing = this._publishNext(symbol, state, snapshot, persisted)
			.catch((err: unknown) => {
				getLogger().error("Market data publish failed", {
					context: { symbol },
					error: err,
				});
			})
			.finally(() => {
				state.publishing = undefined;
			});
	}

	private async _publishNext(
		symbol: TradingSymbol,
		state: SymbolState,
		snapshot: MarketDataSnapshot,
		persisted: boolean
	): Promise<void> {
		const series = this._seriesOf(symbol);
		const fresh = persisted ? (snapshot.candles ?? []) : [];
		const next = await this._nextCandles(series, state, fresh);
		const candles =
			next === undefined ||
			(next.batch.length === 0 && snapshot.candles === undefined)
				? undefined
				: next.batch;

		const failed = await this._deps.publisher.publish({ ...snapshot, candles });

		const last = next?.batch[next.batch.length - 1];
		if (next?.cursor && last && !failed.includes("candles")) {
			const moved: PublishCursor = {
				market: next.cursor.market,
				publishedUntil: UnixTimestamp.of(last.timestamp + 1),
			};
			// Ahead of MySQL if the save fails: a restart then sends the batch
			// again, which the trainer skips (strictly increasing timestamps).
			state.publish = moved;
			await this._deps.backlog.saveCursor(series, moved);
		}
		await this._refreshBacklogGauge(symbol, state);
	}

	/**
	 * The next persisted candles to publish, or undefined when the backlog is
	 * unreadable (MySQL down): the other parts of the snapshot still go out.
	 */
	private async _nextCandles(
		series: CandleSeries,
		state: SymbolState,
		fresh: CandleData[]
	): Promise<NextCandles | undefined> {
		try {
			if (!state.publishLoaded) {
				state.publish = await this._deps.backlog.cursor(series);
				state.publishLoaded = true;
			}
			const first = fresh[0];
			if (!state.publish && first) {
				state.publish = {
					market: first.market,
					publishedUntil: first.timestamp,
				};
				await this._deps.backlog.saveCursor(series, state.publish);
			}
			if (!state.publish) {
				return { batch: [] };
			}
			const batch = await this._deps.backlog.candlesFrom(
				series,
				state.publish,
				MAX_CANDLES_PER_PUBLISH
			);
			return { cursor: state.publish, batch };
		} catch (err) {
			getLogger().error("Candle publish backlog unreadable", {
				context: { symbol: series.symbol },
				error: err,
			});
		}
	}

	private async _refreshBacklogGauge(
		symbol: TradingSymbol,
		state: SymbolState
	): Promise<void> {
		if (!state.publish) {
			return;
		}
		try {
			const waiting = await this._deps.backlog.countFrom(
				this._seriesOf(symbol),
				state.publish
			);
			UNPUBLISHED_CANDLES.set({ symbol }, waiting);
		} catch (err) {
			getLogger().warn("Candle publish backlog not counted", {
				context: { symbol },
				error: err,
			});
		}
	}
}

async function _createLimiter(
	maxConcurrency: PositiveInt
): Promise<LimitFunction> {
	const { default: pLimit } = (await import("p-limit")) as unknown as {
		default: (concurrency: number) => LimitFunction;
	};
	return pLimit(maxConcurrency);
}
