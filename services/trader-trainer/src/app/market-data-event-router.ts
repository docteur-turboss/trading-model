import type { MarketEvent } from "@trading-model/validation/contracts/market-events";
import { DataType } from "../core/data-handlers/data-types";
import {
	MarketDataBuffer,
	type MarketDataBufferConfig,
} from "../core/market-data-buffer";
import { DataEventHandler } from "./event-handlers";

export class MarketDataEventRouter {
	public readonly dataBuffer: MarketDataBuffer;
	private readonly _handler: DataEventHandler;

	constructor(bufferConfig: MarketDataBufferConfig) {
		this.dataBuffer = new MarketDataBuffer(bufferConfig);
		this._handler = new DataEventHandler(this.dataBuffer);
	}

	onCandlestickSeries(data: unknown): void {
		this._handler.handle(DataType.Candle, data);
	}

	onRecentTrades(data: unknown): void {
		this._handler.handle(DataType.Trade, data);
	}

	onOrderBookSnapshot(data: unknown): void {
		this._handler.handle(DataType.OrderBook, data);
	}

	onOrderBookTickerSnapshot(data: unknown): void {
		this._handler.handle(DataType.BookTicker, data);
	}

	on24hrTickerStats(data: unknown): void {
		this._handler.handle(DataType.Ticker, data);
	}

	onPriceTickerSnapshot(data: unknown): void {
		this._handler.handle(DataType.Price, data);
	}

	getSubscribedIntents(): MarketEvent[] {
		return this._handler.getSubscribedIntents();
	}
}
