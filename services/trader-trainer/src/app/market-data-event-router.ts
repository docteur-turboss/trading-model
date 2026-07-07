import {
	MarketDataBuffer,
	type MarketDataBufferConfig,
} from "../core/market-data-buffer";
import type { EventEnumMap } from "@trading-model/common/config/event.types";
import { DataEventHandler } from "./event-handlers";

export class MarketDataEventRouter {
	public readonly dataBuffer: MarketDataBuffer;
	private readonly _handler: DataEventHandler;

	constructor(bufferConfig: MarketDataBufferConfig) {
		this.dataBuffer = new MarketDataBuffer(bufferConfig);
		this._handler = new DataEventHandler(this.dataBuffer);
	}

	onCandlestickSeries(data: unknown): void {
		this._handler.handle("candle", data);
	}

	onRecentTrades(data: unknown): void {
		this._handler.handle("trade", data);
	}

	onOrderBookSnapshot(data: unknown): void {
		this._handler.handle("orderBook", data);
	}

	onOrderBookTickerSnapshot(data: unknown): void {
		this._handler.handle("bookTicker", data);
	}

	on24hrTickerStats(data: unknown): void {
		this._handler.handle("ticker", data);
	}

	onPriceTickerSnapshot(data: unknown): void {
		this._handler.handle("price", data);
	}

	getSubscribedIntents(): EventEnumMap[] {
		return this._handler.getSubscribedIntents();
	}
}
