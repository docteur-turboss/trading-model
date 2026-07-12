import type { EventEnumMap } from "@trading-model/common/config/event.types";
import type { Price } from "@trading-model/common/domain/primitives";
import { EvictionPolicy } from "../core/eviction-policy";
import type {
	MarketDataBuffer,
	MarketDataBufferConfig,
} from "../core/market-data-buffer";
import type { TradingSymbol } from "../core/market-data-types";
import { Trainer } from "../core/trainer";
import { MarketDataEventRouter } from "./market-data-event-router";
import { TrainingLoop, type TrainingLoopConfig } from "./training-loop";

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
			evictionPolicy: EvictionPolicy.Lru,
		};
		this.eventRouter = new MarketDataEventRouter(bufferConfig);
		this.trainer = new Trainer(this.eventRouter.dataBuffer);
		this._trainingLoop = new TrainingLoop(
			this.trainer,
			this.eventRouter.dataBuffer
		);
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

	startTrainingLoop(config: TrainingLoopConfig): void {
		this._trainingLoop.start(config);
	}

	stopTrainingLoop(): void {
		this._trainingLoop.stop();
	}
}
