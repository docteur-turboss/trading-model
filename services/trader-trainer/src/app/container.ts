import {
	EnumEventMessage,
	type EventEnumMap,
} from "@trading-model/common/config/event.types";

import {
	MarketDataBuffer,
	type MarketDataBufferConfig,
} from "../core/market-data-buffer";
import type { TradingSymbol } from "../core/market-data-types";
import { Price } from "@trading-model/common/domain/primitives";
import { Trainer } from "../core/trainer";
import { TrainingLoop } from "./training-loop";

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
	private readonly _trainingLoop: TrainingLoop;

	constructor(config: AppContainerConfig) {
		const bufferConfig: MarketDataBufferConfig = {
			maxSize: config.bufferSize,
			maxMemoryMb: config.bufferMemoryLimitMb ?? 512,
			evictionPolicy: "LRU",
		};
		this.dataBuffer = new MarketDataBuffer(bufferConfig);
		this.trainer = new Trainer(this.dataBuffer);
		this._trainingLoop = new TrainingLoop(this.trainer, this.dataBuffer);
	}

	onCandlestickSeries(data: { candle: import("@trading-model/common/config/event.types").CandleData[] }): void {
		if (!data?.candle || data.candle.length === 0) {
			return;
		}
		const symbol = data.candle[0].symbol;
		this.dataBuffer.addCandles(symbol, data.candle);
	}

	onRecentTrades(data: { trades: import("@trading-model/common/config/event.types").TradeData[] }): void {
		if (!data?.trades || data.trades.length === 0) {
			return;
		}
		const symbol = data.trades[0].symbol;
		this.dataBuffer.addTrades(symbol, data.trades);
	}

	onOrderBookSnapshot(data: { orderBook: import("@trading-model/common/config/event.types").OrderBookData[] }): void {
		if (!data?.orderBook || data.orderBook.length === 0) {
			return;
		}
		this.dataBuffer.setOrderBook(data.orderBook[0].symbol, data.orderBook[0]);
	}

	onOrderBookTickerSnapshot(data: { bookTicker: import("@trading-model/common/config/event.types").BookTickerData[] }): void {
		if (!data?.bookTicker || data.bookTicker.length === 0) {
			return;
		}
		for (const bt of data.bookTicker) {
			this.dataBuffer.setBookTicker(bt.symbol, bt);
		}
	}

	on24hrTickerStats(data: { ticker: import("@trading-model/common/config/event.types").TickerData[] }): void {
		if (!data?.ticker || data.ticker.length === 0) {
			return;
		}
		for (const tk of data.ticker) {
			this.dataBuffer.setTicker24h(tk.symbol, tk);
		}
	}

	onPriceTickerSnapshot(data: { price: Record<TradingSymbol, Price> }): void {
		if (!data?.price) {
			return;
		}
		this.dataBuffer.setPriceSnapshot(data.price);
	}

	getSubscribedIntents(): EventEnumMap[] {
		return [
			EnumEventMessage.fetchCandlestickSeries,
			EnumEventMessage.fetchRecentTrades,
			EnumEventMessage.fetchOrderBookSnapshot,
			EnumEventMessage.fetchOrderBookTickerSnapshot,
			EnumEventMessage.fetch24hrTickerStats,
			EnumEventMessage.fetchPriceTickerSnapshot,
		];
	}

	startTrainingLoop(symbols: TradingSymbol[], intervalMs: number): void {
		this._trainingLoop.start(symbols, intervalMs);
	}

	stopTrainingLoop(): void {
		this._trainingLoop.stop();
	}
}
