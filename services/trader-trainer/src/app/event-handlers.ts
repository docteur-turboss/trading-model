import { MarketEvent } from "@trading-model/validation/domain/contracts/market-events";
import { DataType } from "../core/data-handlers/data-types";
import type { MarketDataBuffer } from "../core/market-data-buffer";
import { processBookTicker } from "./event-processors/book-ticker-processor";
import { processCandle } from "./event-processors/candle-processor";
import { processOrderBook } from "./event-processors/order-book-processor";
import { processPrice } from "./event-processors/price-processor";
import { processTicker } from "./event-processors/ticker-processor";
import { processTrade } from "./event-processors/trade-processor";

export const EVENT_TO_HANDLER: Partial<Record<MarketEvent, DataType>> = {
	[MarketEvent.FetchCandlestickSeries]: DataType.Candle,
	[MarketEvent.FetchRecentTrades]: DataType.Trade,
	[MarketEvent.FetchOrderBookSnapshot]: DataType.OrderBook,
	[MarketEvent.FetchOrderBookTickerSnapshot]: DataType.BookTicker,
	[MarketEvent.Fetch24hrTickerStats]: DataType.Ticker,
};

type EventProcessor = (buffer: MarketDataBuffer, data: unknown) => void;

const EVENT_PROCESSORS: Record<DataType, EventProcessor> = {
	[DataType.Candle]: processCandle,
	[DataType.Trade]: processTrade,
	[DataType.OrderBook]: processOrderBook,
	[DataType.BookTicker]: processBookTicker,
	[DataType.Ticker]: processTicker,
	[DataType.Price]: processPrice,
};

export class DataEventHandler {
	private readonly _dataBuffer: MarketDataBuffer;

	constructor(dataBuffer: MarketDataBuffer) {
		this._dataBuffer = dataBuffer;
	}

	handle(dataType: DataType, data: unknown): void {
		EVENT_PROCESSORS[dataType]?.(this._dataBuffer, data);
	}

	getSubscribedIntents(): MarketEvent[] {
		return Object.keys(EVENT_TO_HANDLER) as MarketEvent[];
	}
}
