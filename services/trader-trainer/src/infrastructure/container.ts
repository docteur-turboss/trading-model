import { TrainingLoop } from "../adapters/inbound/app/training-loop";
import { DataEventHandler } from "../app/event-handlers";
import { MessageManager } from "../config/message-manager";
import { EvictionPolicy } from "../core/eviction-policy";
import {
	MarketDataBuffer,
	type MarketDataBufferConfig,
} from "../core/market-data-buffer";
import type { TradingSymbol } from "../core/market-data-types";
import { ModelPublisher } from "../core/model-publisher";
import { Trainer } from "../core/trainer";

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

		const publisher = new ModelPublisher(MessageManager, {
			trainerId: "trader-trainer",
			instanceId: process.env.INSTANCE_ID ?? "trader-trainer-1",
		});
		this.trainer = new Trainer(this.dataBuffer, publisher);
		this.trainingLoop = new TrainingLoop(this.trainer, this.dataBuffer);
	}
}
