import type { CandleData } from "@trading-model/contracts/market-data.types";
import { DataType } from "../data-handlers/data-types";
import type { FeatureState, SymbolState } from "../market-data-types";
import type { NormalizationManager } from "../normalization-manager";

/** The trade features read the trades of the last minute before the close. */
export const TRADE_LOOKBACK_MS = 60_000;

/** A candle is known at its close: the scraper only publishes closed ones. */
export function candleKnownAt(candle: CandleData): number {
	return Number(candle.closeTimestamp ?? candle.timestamp);
}

/** A series kept in time order, taken in as the candles go by. */
class KnownSeries<TData> {
	private _known = 0;

	constructor(
		private readonly _items: readonly TData[],
		private readonly _at: (item: TData) => number,
		private readonly _learn: (item: TData) => void
	) {}

	/** Takes in every item known at `time`; returns how many are known. */
	advance(time: number): number {
		while (
			this._known < this._items.length &&
			this._at(this._items[this._known]) <= time
		) {
			this._learn(this._items[this._known]);
			this._known++;
		}
		return this._known;
	}

	latest(time: number): TData | undefined {
		const known = this.advance(time);
		return known > 0 ? this._items[known - 1] : undefined;
	}
}

/**
 * Visits each candle with what was known at its close, oldest first (ADR-0030):
 * the latest snapshot received by then, the trades of the lookback window, and
 * normalisation statistics of that data only. Reading the state directly gave
 * every past candle the newest order book, ticker and price, trades received
 * after it and statistics of the whole buffer: the future leaked into training
 * and into walk-forward validation.
 */
export function forEachPointInTime(
	state: SymbolState,
	normManager: NormalizationManager,
	visit: (view: FeatureState, idx: number) => void
): void {
	const norm = normManager.createNormStats();
	const learn =
		<TData>(dataType: DataType) =>
		(item: TData) =>
			normManager.updateNorms(dataType, { norm }, item);
	const trades = new KnownSeries(
		state.trades,
		(trade) => Number(trade.timestamp),
		learn(DataType.Trade)
	);
	const orderBooks = new KnownSeries(
		state.orderBooks,
		(book) => Number(book.timestamp),
		learn(DataType.OrderBook)
	);
	const bookTickers = new KnownSeries(
		state.bookTickers,
		(bt) => Number(bt.timestamp),
		learn(DataType.BookTicker)
	);
	const tickers = new KnownSeries(
		state.tickers24h,
		(ticker) => Number(ticker.closeTimestamp),
		learn(DataType.Ticker)
	);
	const prices = new KnownSeries(
		state.prices,
		(snapshot) => snapshot.timestamp,
		() => undefined
	);
	let firstRecentTrade = 0;
	state.candles.forEach((candle, idx) => {
		const at = candleKnownAt(candle);
		normManager.updateNorms(DataType.Candle, { norm }, candle);
		const knownTrades = trades.advance(at);
		while (
			firstRecentTrade < knownTrades &&
			Number(state.trades[firstRecentTrade].timestamp) <= at - TRADE_LOOKBACK_MS
		) {
			firstRecentTrade++;
		}
		visit(
			{
				candles: state.candles,
				trades: state.trades.slice(firstRecentTrade, knownTrades),
				orderBook: orderBooks.latest(at),
				bookTicker: bookTickers.latest(at),
				ticker24h: tickers.latest(at),
				price: prices.latest(at)?.price,
				norm,
			},
			idx
		);
	});
}
