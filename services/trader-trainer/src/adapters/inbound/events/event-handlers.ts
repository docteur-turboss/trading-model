import { MarketEvent } from "@trading-model/contracts/market-events";
import type { Price } from "@trading-model/primitives/primitives";
import { DataType } from "../../../domain/data-handlers/data-types";
import type { MarketDataBuffer } from "../../../domain/market-data-buffer";
import type { TradingSymbol } from "../../../domain/market-data-types";

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

/**
 * Forwards the items of a named list field of the event payload to the buffer
 * under the given data type; `firstOnly` keeps the first item only.
 */
function listProcessor(
	field: string,
	dataType: DataType,
	firstOnly = false
): EventProcessor {
	return (buffer, data) => {
		const items = (
			data as Record<string, { symbol: TradingSymbol }[] | undefined>
		)?.[field];
		if (!items?.length) {
			return;
		}
		for (const item of firstOnly ? items.slice(0, 1) : items) {
			buffer.addData(dataType, item.symbol, item);
		}
	};
}

const EVENT_PROCESSORS: Record<DataType, EventProcessor> = {
	[DataType.Candle]: listProcessor("candle", DataType.Candle),
	[DataType.Trade]: listProcessor("trades", DataType.Trade),
	[DataType.OrderBook]: listProcessor("orderBook", DataType.OrderBook, true),
	[DataType.BookTicker]: listProcessor("bookTicker", DataType.BookTicker),
	[DataType.Ticker]: listProcessor("ticker", DataType.Ticker),
	[DataType.Price]: (buffer, data) => {
		const parsed = data as { price?: Record<TradingSymbol, Price> };
		if (!parsed?.price) {
			return;
		}
		buffer.setPriceSnapshot(parsed.price);
	},
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
