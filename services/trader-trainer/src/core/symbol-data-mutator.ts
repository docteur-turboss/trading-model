import type {
	BookTickerData,
	CandleData,
	OrderBookData,
	TickerData,
	TradeData,
} from "@trading-model/common/config/event.types";
import type { MemoryManager } from "./market-data/memory-manager";
import type { SymbolState, TradingSymbol } from "./market-data-types";
import type { NormalizationManager } from "./normalization-manager";

export class SymbolDataMutator {
	constructor(
		private readonly _memoryManager: MemoryManager,
		private readonly _normManager: NormalizationManager
	) {}

	private _trimExcess<T>(arr: T[], maxSize: number): T[] {
		return arr.length > maxSize ? arr.slice(-maxSize) : arr;
	}

	addCandles(
		symbol: TradingSymbol,
		candles: CandleData[],
		states: Map<TradingSymbol, SymbolState>,
		maxSize: number
	): void {
		const state = states.get(symbol);
		if (!state) {
			return;
		}
		for (const candle of candles) {
			state.candles.push(candle);
			this._normManager.updateCandleNorms(state, candle);
		}
		state.candles = this._trimExcess(state.candles, maxSize);
		this._memoryManager.enforceMemoryLimit();
	}

	addTrades(
		symbol: TradingSymbol,
		trades: TradeData[],
		states: Map<TradingSymbol, SymbolState>,
		maxSize: number
	): void {
		const state = states.get(symbol);
		if (!state) {
			return;
		}
		for (const trade of trades) {
			state.trades.push(trade);
			this._normManager.updateTradeNorms(state, trade);
		}
		state.trades = this._trimExcess(state.trades, maxSize);
		this._memoryManager.enforceMemoryLimit();
	}

	setOrderBook(
		symbol: TradingSymbol,
		orderBook: OrderBookData,
		states: Map<TradingSymbol, SymbolState>
	): void {
		const state = states.get(symbol);
		if (!state) {
			return;
		}
		state.orderBook = orderBook;
		this._normManager.updateOrderBookNorms(state, orderBook);
		this._memoryManager.enforceMemoryLimit();
	}

	setBookTicker(
		symbol: TradingSymbol,
		bt: BookTickerData,
		states: Map<TradingSymbol, SymbolState>
	): void {
		const state = states.get(symbol);
		if (!state) {
			return;
		}
		state.bookTicker = bt;
		this._normManager.updateBookTickerNorms(state, bt);
		this._memoryManager.enforceMemoryLimit();
	}

	setTicker24h(
		symbol: TradingSymbol,
		ticker: TickerData,
		states: Map<TradingSymbol, SymbolState>
	): void {
		const state = states.get(symbol);
		if (!state) {
			return;
		}
		state.ticker24h = ticker;
		this._normManager.updateTicker24hNorms(state, ticker);
		this._memoryManager.enforceMemoryLimit();
	}
}
