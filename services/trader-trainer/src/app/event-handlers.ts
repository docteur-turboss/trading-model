import {
	EnumEventMessage,
	type EventEnumMap,
} from "@trading-model/common/config/event.types";
import type { DataType } from "../core/data-handlers/data-handler";
import { MarketDataBuffer } from "../core/market-data-buffer";
import { processCandle } from "./event-processors/candle-processor";
import { processTrade } from "./event-processors/trade-processor";
import { processOrderBook } from "./event-processors/order-book-processor";
import { processBookTicker } from "./event-processors/book-ticker-processor";
import { processTicker } from "./event-processors/ticker-processor";
import { processPrice } from "./event-processors/price-processor";

export const EVENT_TO_HANDLER: Record<string, DataType> = {
	[EnumEventMessage.fetchCandlestickSeries]: "candle",
	[EnumEventMessage.fetchRecentTrades]: "trade",
	[EnumEventMessage.fetchOrderBookSnapshot]: "orderBook",
	[EnumEventMessage.fetchOrderBookTickerSnapshot]: "bookTicker",
	[EnumEventMessage.fetch24hrTickerStats]: "ticker",
};

type EventProcessor = (buffer: MarketDataBuffer, data: unknown) => void;

const EVENT_PROCESSORS: Record<string, EventProcessor> = {
	candle: processCandle,
	trade: processTrade,
	orderBook: processOrderBook,
	bookTicker: processBookTicker,
	ticker: processTicker,
	price: processPrice,
};

export class DataEventHandler {
	private readonly _dataBuffer: MarketDataBuffer;

	constructor(dataBuffer: MarketDataBuffer) {
		this._dataBuffer = dataBuffer;
	}

	handle(dataType: DataType, data: unknown): void {
		EVENT_PROCESSORS[dataType]?.(this._dataBuffer, data);
	}

	getSubscribedIntents(): EventEnumMap[] {
		return Object.keys(EVENT_TO_HANDLER) as EventEnumMap[];
	}
}
