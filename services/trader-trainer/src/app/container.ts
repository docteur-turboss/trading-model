import { EvictionPolicy } from "../core/eviction-policy";
import type {
	MarketDataBuffer,
	MarketDataBufferConfig,
} from "../core/market-data-buffer";
import type { TradingSymbol } from "../core/market-data-types";
import { Trainer } from "../core/trainer";
import { DataEventHandler } from "./event-handlers";
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
	public readonly eventHandler: DataEventHandler;
	public readonly trainer: Trainer;
	public readonly trainingLoop: TrainingLoop;

	constructor(config: AppContainerConfig) {
		const bufferConfig: MarketDataBufferConfig = {
			maxSize: config.bufferSize,
			maxMemoryBytes: (config.bufferMemoryLimitMb ?? 512) * 1024 * 1024,
			evictionPolicy: EvictionPolicy.Lru,
		};
		this.dataBuffer = new MarketDataBuffer(bufferConfig);
		this.eventHandler = new DataEventHandler(this.dataBuffer);
		this.trainer = new Trainer(this.dataBuffer);
		this.trainingLoop = new TrainingLoop(this.trainer, this.dataBuffer);
	}
}
