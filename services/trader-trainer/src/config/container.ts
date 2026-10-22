import { toSymbol } from "@trading-model/primitives/primitives";
import { DataEventHandler } from "../adapters/inbound/events/event-handlers";
import { TrainingLoop } from "../adapters/inbound/scheduler/training-loop";
import { ModelPublisher } from "../adapters/outbound/model-publisher";
import { Trainer } from "../application/trainer";
import { EvictionPolicy } from "../domain/eviction-policy";
import type { GaTelemetry } from "../domain/genetic-algorithm/ga-telemetry";
import {
	MarketDataBuffer,
	type MarketDataBufferConfig,
} from "../domain/market-data-buffer";
import type { TradingSymbol } from "../domain/market-data-types";
import { MessageManager } from "./message-manager";
import {
	CURRENT_GENERATION,
	MARKET_DATA_BUFFER_SIZE,
	MARKET_DATA_SYMBOLS,
	POPULATION_SIZE,
	QLEARNING_TRAIN_ERRORS,
	STAGNATION_GENERATIONS,
} from "./metrics";

/** Binds the GA engine hooks to the Prometheus collectors. */
const PROMETHEUS_GA_TELEMETRY: GaTelemetry = {
	generationStarted(generation, populationSize) {
		CURRENT_GENERATION.set(generation);
		POPULATION_SIZE.set(populationSize);
	},
	stagnationUpdated(stagnation) {
		STAGNATION_GENERATIONS.set(stagnation);
	},
	evaluationFailed(reason) {
		QLEARNING_TRAIN_ERRORS.inc({ reason });
	},
};

export interface AppContainerConfig {
	bufferSize: number;
	symbols: TradingSymbol[];
	validationSplit: number;
	walkForwardFolds: number;
	generations: number;
	populationSize: number;
	timeBudgetMs: number;
	episodesPerIndividual: number;
	bufferMemoryLimitMb?: number;
}

export class ApplicationContainer {
	public readonly symbols: TradingSymbol[];
	public readonly dataBuffer: MarketDataBuffer;
	public readonly eventHandler: DataEventHandler;
	public readonly trainer: Trainer;
	public readonly trainingLoop: TrainingLoop;

	constructor(config: AppContainerConfig) {
		this.symbols = config.symbols;
		const bufferConfig: MarketDataBufferConfig = {
			maxSize: config.bufferSize,
			maxMemoryBytes: (config.bufferMemoryLimitMb ?? 512) * 1024 * 1024,
			evictionPolicy: EvictionPolicy.Lru,
			onDataAdded: (symbol, candleCount, symbolCount) => {
				MARKET_DATA_BUFFER_SIZE.set({ symbol: String(symbol) }, candleCount);
				MARKET_DATA_SYMBOLS.set(symbolCount);
			},
		};
		this.dataBuffer = new MarketDataBuffer(bufferConfig);
		this.eventHandler = new DataEventHandler(this.dataBuffer);

		const publisher = new ModelPublisher(MessageManager, {
			trainerId: "trader-trainer",
			instanceId: process.env.INSTANCE_ID ?? "trader-trainer-1",
		});
		this.trainer = new Trainer(this.dataBuffer, {
			settings: {
				validationSplit: config.validationSplit,
				walkForwardFolds: config.walkForwardFolds,
				generations: config.generations,
				populationSize: config.populationSize,
				timeBudgetMs: config.timeBudgetMs,
				episodesPerIndividual: config.episodesPerIndividual,
			},
			publisher,
			telemetry: PROMETHEUS_GA_TELEMETRY,
		});
		this.trainingLoop = new TrainingLoop(this.trainer, this.dataBuffer);
	}
}

export interface TraderTrainerSettings {
	TRAINER_DATA_WINDOW: number;
	/** Comma-separated symbols, e.g. "BTCUSDT,ETHUSDT". */
	TRAINER_SYMBOLS: string;
	TRAINER_VALIDATION_SPLIT: number;
	TRAINER_WALK_FORWARD_FOLDS: number;
	TRAINER_GENERATIONS: number;
	TRAINER_POPULATION_SIZE: number;
	TRAINER_TIME_BUDGET_MS: number;
	TRAINER_EPISODES_PER_INDIVIDUAL: number;
}

/** Builds the service container from the environment settings. */
export function createTraderTrainerContainer(
	settings: TraderTrainerSettings
): ApplicationContainer {
	return new ApplicationContainer({
		bufferSize: settings.TRAINER_DATA_WINDOW,
		symbols: settings.TRAINER_SYMBOLS.split(",").map((symbol) =>
			toSymbol(symbol.trim())
		),
		validationSplit: settings.TRAINER_VALIDATION_SPLIT,
		walkForwardFolds: settings.TRAINER_WALK_FORWARD_FOLDS,
		generations: settings.TRAINER_GENERATIONS,
		populationSize: settings.TRAINER_POPULATION_SIZE,
		timeBudgetMs: settings.TRAINER_TIME_BUDGET_MS,
		episodesPerIndividual: settings.TRAINER_EPISODES_PER_INDIVIDUAL,
	});
}
