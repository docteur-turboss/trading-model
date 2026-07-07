import {
	EnumEventMessage,
	type EventEnumMap,
} from "@trading-model/common/config/event.types";
import type { Price } from "@trading-model/common/domain/primitives";
import {
	createDefaultHandlers,
	type DataHandler,
} from "../core/data-handlers/data-handler";
import {
	MarketDataBuffer,
	type MarketDataBufferConfig,
} from "../core/market-data-buffer";
import type { TradingSymbol } from "../core/market-data-types";
import { Trainer } from "../core/trainer";
import { TrainingLoop } from "./training-loop";

const EVENT_TO_HANDLER: Record<string, string> = {
	[EnumEventMessage.fetchCandlestickSeries]: "candle",
	[EnumEventMessage.fetchRecentTrades]: "trade",
	[EnumEventMessage.fetchOrderBookSnapshot]: "orderBook",
	[EnumEventMessage.fetchOrderBookTickerSnapshot]: "bookTicker",
	[EnumEventMessage.fetch24hrTickerStats]: "ticker",
};

export interface AppContainerConfig {
	bufferSize: number;
	symbols: TradingSymbol[];
	validationSplit: number;
	generations: number;
	populationSize: number;
	timeBudgetMs: number;
	episodesPerIndividual: number;
	bufferMemoryLimitMb?: number;
}

export class ApplicationContainer {
	public readonly dataBuffer: MarketDataBuffer;
	public readonly trainer: Trainer;
	private readonly _handlers: Record<string, DataHandler>;
	private readonly _trainingLoop: TrainingLoop;

	constructor(config: AppContainerConfig) {
		const bufferConfig: MarketDataBufferConfig = {
			maxSize: config.bufferSize,
			maxMemoryMb: config.bufferMemoryLimitMb ?? 512,
			evictionPolicy: "LRU",
		};
		this.dataBuffer = new MarketDataBuffer(bufferConfig);
		this.trainer = new Trainer(this.dataBuffer);
		this._handlers = Object.fromEntries(
			createDefaultHandlers().map((h) => [h.dataType, h])
		);
		this._trainingLoop = new TrainingLoop(this.trainer, this.dataBuffer);
	}

	private _addDataForSymbol(
		dataType: string,
		data: unknown[],
		symbol: TradingSymbol
	): void {
		for (const item of data) {
			this.dataBuffer.addData(dataType, symbol, item);
		}
	}

	onCandlestickSeries(data: {
		candle: import("@trading-model/common/config/event.types").CandleData[];
	}): void {
		if (!data?.candle?.length) return;
		this._addDataForSymbol("candle", data.candle, data.candle[0].symbol);
	}

	onRecentTrades(data: {
		trades: import("@trading-model/common/config/event.types").TradeData[];
	}): void {
		if (!data?.trades?.length) return;
		this._addDataForSymbol("trade", data.trades, data.trades[0].symbol);
	}

	onOrderBookSnapshot(data: {
		orderBook: import("@trading-model/common/config/event.types").OrderBookData[];
	}): void {
		if (!data?.orderBook?.length) return;
		this.dataBuffer.addData(
			"orderBook",
			data.orderBook[0].symbol,
			data.orderBook[0]
		);
	}

	onOrderBookTickerSnapshot(data: {
		bookTicker: import("@trading-model/common/config/event.types").BookTickerData[];
	}): void {
		if (!data?.bookTicker?.length) return;
		for (const bt of data.bookTicker) {
			this.dataBuffer.addData("bookTicker", bt.symbol, bt);
		}
	}

	on24hrTickerStats(data: {
		ticker: import("@trading-model/common/config/event.types").TickerData[];
	}): void {
		if (!data?.ticker?.length) return;
		for (const tk of data.ticker) {
			this.dataBuffer.addData("ticker", tk.symbol, tk);
		}
	}

	onPriceTickerSnapshot(data: { price: Record<TradingSymbol, Price> }): void {
		if (!data?.price) return;
		this.dataBuffer.setPriceSnapshot(data.price);
	}

	getSubscribedIntents(): EventEnumMap[] {
		return Object.keys(EVENT_TO_HANDLER) as EventEnumMap[];
	}

	startTrainingLoop(symbols: TradingSymbol[], intervalMs: number): void {
		this._trainingLoop.start(symbols, intervalMs);
	}

	stopTrainingLoop(): void {
		this._trainingLoop.stop();
	}
}
