import {
	type BookTickerData,
	type CandleData,
	getAvgAsk,
	getAvgBid,
	type OrderBookData,
	type TickerData,
	type TradeData,
} from "@trading-model/common/config/event.types";
import type { SymbolState, TradingSymbol } from "../market-data-types";
import type { NormalizationStats } from "../normalization-stats";

export interface DataHandler<TData = unknown> {
	readonly dataType: string;

	updateNorms(state: SymbolState, data: TData): void;

	mutateState(
		symbol: TradingSymbol,
		data: TData,
		state: SymbolState,
		maxSize?: number
	): void;

	serializeNorms(
		state: SymbolState
	): Record<string, ReturnType<NormalizationStats["toJSON"]>>;
}

export class CandleHandler implements DataHandler<CandleData> {
	readonly dataType = "candle";

	updateNorms(state: SymbolState, candle: CandleData): void {
		state.norm.candleClose.update(candle.close);
		state.norm.candleVolume.update(candle.volume);
		state.norm.candleOpen.update(candle.open);
		state.norm.candleHigh.update(candle.high);
		state.norm.candleLow.update(candle.low);
	}

	mutateState(
		_symbol: TradingSymbol,
		data: CandleData,
		state: SymbolState,
		maxSize?: number
	): void {
		state.candles.push(data);
		if (maxSize !== undefined && state.candles.length > maxSize) {
			state.candles = state.candles.slice(-maxSize);
		}
	}

	serializeNorms(
		state: SymbolState
	): Record<string, ReturnType<NormalizationStats["toJSON"]>> {
		return {
			closeNorm: state.norm.candleClose.toJSON(),
			volumeNorm: state.norm.candleVolume.toJSON(),
			openNorm: state.norm.candleOpen.toJSON(),
			highNorm: state.norm.candleHigh.toJSON(),
			lowNorm: state.norm.candleLow.toJSON(),
		};
	}
}

export class TradeHandler implements DataHandler<TradeData> {
	readonly dataType = "trade";

	updateNorms(state: SymbolState, trade: TradeData): void {
		state.norm.tradePrice.update(trade.price);
		state.norm.tradeQty.update(trade.quantity);
	}

	mutateState(
		_symbol: TradingSymbol,
		data: TradeData,
		state: SymbolState,
		maxSize?: number
	): void {
		state.trades.push(data);
		if (maxSize !== undefined && state.trades.length > maxSize) {
			state.trades = state.trades.slice(-maxSize);
		}
	}

	serializeNorms(
		state: SymbolState
	): Record<string, ReturnType<NormalizationStats["toJSON"]>> {
		return {
			tradePriceNorm: state.norm.tradePrice.toJSON(),
			tradeQtyNorm: state.norm.tradeQty.toJSON(),
		};
	}
}

export class OrderBookHandler implements DataHandler<OrderBookData> {
	readonly dataType = "orderBook";

	updateNorms(state: SymbolState, orderBook: OrderBookData): void {
		const avgBid = getAvgBid(orderBook);
		const avgAsk = getAvgAsk(orderBook);
		if (avgBid > 0) state.norm.bid.update(avgBid);
		if (avgAsk > 0) state.norm.ask.update(avgAsk);
		if (avgAsk > 0 && avgBid > 0) state.norm.spread.update(avgAsk - avgBid);
	}

	mutateState(
		_symbol: TradingSymbol,
		data: OrderBookData,
		state: SymbolState,
		_maxSize?: number
	): void {
		state.orderBook = data;
	}

	serializeNorms(
		state: SymbolState
	): Record<string, ReturnType<NormalizationStats["toJSON"]>> {
		return {
			bidNorm: state.norm.bid.toJSON(),
			askNorm: state.norm.ask.toJSON(),
			spreadNorm: state.norm.spread.toJSON(),
		};
	}
}

export class BookTickerHandler implements DataHandler<BookTickerData> {
	readonly dataType = "bookTicker";

	updateNorms(state: SymbolState, bt: BookTickerData): void {
		if (bt.bid > 0) state.norm.bid.update(bt.bid);
		if (bt.ask > 0) state.norm.ask.update(bt.ask);
		if (bt.ask > 0 && bt.bid > 0) state.norm.spread.update(bt.ask - bt.bid);
	}

	mutateState(
		_symbol: TradingSymbol,
		data: BookTickerData,
		state: SymbolState,
		_maxSize?: number
	): void {
		state.bookTicker = data;
	}

	serializeNorms(
		_state: SymbolState
	): Record<string, ReturnType<NormalizationStats["toJSON"]>> {
		return {};
	}
}

export class TickerHandler implements DataHandler<TickerData> {
	readonly dataType = "ticker";

	updateNorms(state: SymbolState, ticker: TickerData): void {
		state.norm.tickerVolume.update(ticker.volume);
	}

	mutateState(
		_symbol: TradingSymbol,
		data: TickerData,
		state: SymbolState,
		_maxSize?: number
	): void {
		state.ticker24h = data;
	}

	serializeNorms(
		state: SymbolState
	): Record<string, ReturnType<NormalizationStats["toJSON"]>> {
		return {
			tickerVolumeNorm: state.norm.tickerVolume.toJSON(),
		};
	}
}

export function serializeAllNorms(
	state: SymbolState,
	handlers?: DataHandler[]
): Record<string, ReturnType<NormalizationStats["toJSON"]>> {
	const all = (handlers ?? createDefaultHandlers()).reduce(
		(acc, h) => Object.assign(acc, h.serializeNorms(state)),
		{} as Record<string, ReturnType<NormalizationStats["toJSON"]>>
	);
	return all;
}

export function createDefaultHandlers(): DataHandler[] {
	return [
		new CandleHandler(),
		new TradeHandler(),
		new OrderBookHandler(),
		new BookTickerHandler(),
		new TickerHandler(),
	];
}
