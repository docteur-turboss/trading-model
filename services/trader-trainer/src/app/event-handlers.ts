import {
	EnumEventMessage,
	type EventEnumMap,
} from "@trading-model/common/config/event.types";
import type { Price } from "@trading-model/common/domain/primitives";
import {
	MarketDataBuffer,
	type MarketDataBufferConfig,
} from "../core/market-data-buffer";
import type { TradingSymbol } from "../core/market-data-types";

export const EVENT_TO_HANDLER: Record<string, string> = {
	[EnumEventMessage.fetchCandlestickSeries]: "candle",
	[EnumEventMessage.fetchRecentTrades]: "trade",
	[EnumEventMessage.fetchOrderBookSnapshot]: "orderBook",
	[EnumEventMessage.fetchOrderBookTickerSnapshot]: "bookTicker",
	[EnumEventMessage.fetch24hrTickerStats]: "ticker",
};

export abstract class DataEventHandler {
	protected readonly _dataBuffer: MarketDataBuffer;

	constructor(dataBuffer: MarketDataBuffer) {
		this._dataBuffer = dataBuffer;
	}

	protected _addDataForSymbol(
		dataType: string,
		data: unknown[],
		symbol: TradingSymbol
	): void {
		for (const item of data) {
			this._dataBuffer.addData(dataType, symbol, item);
		}
	}

	getSubscribedIntents(): EventEnumMap[] {
		return Object.keys(EVENT_TO_HANDLER) as EventEnumMap[];
	}
}

export class CandleEventHandler extends DataEventHandler {
	onCandlestickSeries(data: {
		candle: import("@trading-model/common/config/event.types").CandleData[];
	}): void {
		if (!data?.candle?.length) return;
		this._addDataForSymbol("candle", data.candle, data.candle[0].symbol);
	}
}

export class TradeEventHandler extends DataEventHandler {
	onRecentTrades(data: {
		trades: import("@trading-model/common/config/event.types").TradeData[];
	}): void {
		if (!data?.trades?.length) return;
		this._addDataForSymbol("trade", data.trades, data.trades[0].symbol);
	}
}

export class OrderBookEventHandler extends DataEventHandler {
	onOrderBookSnapshot(data: {
		orderBook: import("@trading-model/common/config/event.types").OrderBookData[];
	}): void {
		if (!data?.orderBook?.length) return;
		this._dataBuffer.addData(
			"orderBook",
			data.orderBook[0].symbol,
			data.orderBook[0]
		);
	}
}

export class BookTickerEventHandler extends DataEventHandler {
	onOrderBookTickerSnapshot(data: {
		bookTicker: import("@trading-model/common/config/event.types").BookTickerData[];
	}): void {
		if (!data?.bookTicker?.length) return;
		for (const bt of data.bookTicker) {
			this._dataBuffer.addData("bookTicker", bt.symbol, bt);
		}
	}
}

export class TickerEventHandler extends DataEventHandler {
	on24hrTickerStats(data: {
		ticker: import("@trading-model/common/config/event.types").TickerData[];
	}): void {
		if (!data?.ticker?.length) return;
		for (const tk of data.ticker) {
			this._dataBuffer.addData("ticker", tk.symbol, tk);
		}
	}
}

export class PriceEventHandler extends DataEventHandler {
	onPriceTickerSnapshot(data: { price: Record<TradingSymbol, Price> }): void {
		if (!data?.price) return;
		this._dataBuffer.setPriceSnapshot(data.price);
	}
}
