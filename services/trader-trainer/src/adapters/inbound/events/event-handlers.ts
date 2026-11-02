import { MarketEvent } from "@trading-model/contracts/market-events";
import { DataType } from "../../../domain/data-handlers/data-types";
import type { MarketDataBuffer } from "../../../domain/market-data-buffer";
import { processBookTicker } from "./event-processors/book-ticker-processor";
import { processCandle } from "./event-processors/candle-processor";
import { processOrderBook } from "./event-processors/order-book-processor";
import { processPrice } from "./event-processors/price-processor";
import { processTicker } from "./event-processors/ticker-processor";
import { processTrade } from "./event-processors/trade-processor";

/**
 * Single source of the topics the trainer consumes: the bootstrap registers one
 * listener per entry and subscribes to exactly these topics, so a listener can
 * no longer exist without its subscription (the price snapshot never arrived).
 */
const EVENT_TO_HANDLER = {
	[MarketEvent.FetchCandlestickSeries]: DataType.Candle,
	[MarketEvent.FetchRecentTrades]: DataType.Trade,
	[MarketEvent.FetchOrderBookSnapshot]: DataType.OrderBook,
	[MarketEvent.FetchOrderBookTickerSnapshot]: DataType.BookTicker,
	[MarketEvent.Fetch24hrTickerStats]: DataType.Ticker,
	[MarketEvent.FetchPriceTickerSnapshot]: DataType.Price,
} as const satisfies Partial<Record<MarketEvent, DataType>>;

export type SubscribedMarketEvent = keyof typeof EVENT_TO_HANDLER;

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

	/** Handles a broker message received under one of the subscribed topics. */
	handleEvent(event: SubscribedMarketEvent, data: unknown): void {
		this.handle(EVENT_TO_HANDLER[event], data);
	}

	getSubscribedIntents(): SubscribedMarketEvent[] {
		return Object.keys(EVENT_TO_HANDLER) as SubscribedMarketEvent[];
	}
}
