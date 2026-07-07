import type { Price } from "@trading-model/common/domain/primitives";
import type { EventEnumMap } from "@trading-model/common/config/event.types";
import { EvictionPolicy } from "../core/eviction-policy";
import {
	MarketDataBuffer,
	type MarketDataBufferConfig,
} from "../core/market-data-buffer";
import type { TradingSymbol } from "../core/market-data-types";
import { Trainer } from "../core/trainer";
import { MarketDataEventRouter } from "./market-data-event-router";
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
	public readonly eventRouter: MarketDataEventRouter;
	public readonly trainer: Trainer;
	private readonly _trainingLoop: TrainingLoop;

	constructor(config: AppContainerConfig) {
		const bufferConfig: MarketDataBufferConfig = {
			maxSize: config.bufferSize,
			maxMemoryMb: config.bufferMemoryLimitMb ?? 512,
			evictionPolicy: EvictionPolicy.LRU,
		};
		this.eventRouter = new MarketDataEventRouter(bufferConfig);
		this.trainer = new Trainer(this.eventRouter.dataBuffer);
		this._trainingLoop = new TrainingLoop(this.trainer, this.eventRouter.dataBuffer);
	}

	get dataBuffer(): MarketDataBuffer {
		return this.eventRouter.dataBuffer;
	}

	onCandlestickSeries(data: {
		candle: import("@trading-model/common/config/event.types").CandleData[];
	}): void {
		this.eventRouter.onCandlestickSeries(data);
	}

	onRecentTrades(data: {
		trades: import("@trading-model/common/config/event.types").TradeData[];
	}): void {
		this.eventRouter.onRecentTrades(data);
	}

	onOrderBookSnapshot(data: {
		orderBook: import("@trading-model/common/config/event.types").OrderBookData[];
	}): void {
		this.eventRouter.onOrderBookSnapshot(data);
	}

	onOrderBookTickerSnapshot(data: {
		bookTicker: import("@trading-model/common/config/event.types").BookTickerData[];
	}): void {
		this.eventRouter.onOrderBookTickerSnapshot(data);
	}

	on24hrTickerStats(data: {
		ticker: import("@trading-model/common/config/event.types").TickerData[];
	}): void {
		this.eventRouter.on24hrTickerStats(data);
	}

	onPriceTickerSnapshot(data: { price: Record<TradingSymbol, Price> }): void {
		this.eventRouter.onPriceTickerSnapshot(data);
	}

	getSubscribedIntents(): EventEnumMap[] {
		return this.eventRouter.getSubscribedIntents();
	}

	startTrainingLoop(symbols: TradingSymbol[], intervalMs: number): void {
		this._trainingLoop.start(symbols, intervalMs);
	}

	stopTrainingLoop(): void {
		this._trainingLoop.stop();
	}
}
