import { parseCommaSeparated } from "@trading-model/common/utils/comma-separated";
import { getLogger } from "@trading-model/contracts/logger-registry";
import { AssetId, type AssetType } from "@trading-model/contracts/wire/signals";
import { inputGroupNames } from "@trading-model/model-runtime/agent/input-mask";
import { SignalBarHistory } from "@trading-model/model-runtime/signals/signal-bar-history";
import { TradingSymbol } from "@trading-model/primitives/primitives";
import {
	KubernetesLease,
	kubernetesLeaseApi,
} from "@trading-model/reliability/kubernetes-lease";
import {
	type LeaderJob,
	Leadership,
	SOLE_INSTANCE_LEASE,
} from "@trading-model/reliability/leadership";
import { TrainingLoop } from "../adapters/inbound/scheduler/training-loop";
import { FileModelArtifactStore } from "../adapters/outbound/file-model-artifact-store";
import { ModelPublisher } from "../adapters/outbound/model-publisher";
import { runInWorker } from "../adapters/outbound/training-worker/worker-training-runner";
import { Trainer } from "../application/trainer";
import { DEFAULT_ASSET_COSTS, parseAssets } from "../domain/asset-costs";
import { EvictionPolicy } from "../domain/eviction-policy";
import type { GaTelemetry } from "../domain/genetic-algorithm/ga-telemetry";
import type { FitnessType } from "../domain/genetic-algorithm/genome-control";
import type { SimulatorCosts } from "../domain/genetic-algorithm/rl-backend";
import {
	MarketDataBuffer,
	type MarketDataBufferConfig,
} from "../domain/market-data-buffer";
import type { CandleHistoryPort } from "../domain/ports/candle-history.port";
import type { ModelArtifactStorePort } from "../domain/ports/model-artifact-store.port";
import type { SignalHistoryPort } from "../domain/ports/signal-history.port";
import {
	effectiveFitnessType,
	symbolsPerGeneration,
	type TrainingSettings,
} from "../domain/training-settings";
import { MessageManager } from "./message-manager";
import {
	CURRENT_GENERATION,
	DAILY_BAR_ISSUES_TOTAL,
	GENOME_EVALUATION_SECONDS,
	MARKET_DATA_BUFFER_SIZE,
	MARKET_DATA_SYMBOLS,
	QLEARNING_TRAIN_ERRORS,
	STAGNATION_GENERATIONS,
	TRAINING_LEADER,
} from "./metrics";

/** Binds the GA engine hooks to the Prometheus collectors. */
const PROMETHEUS_GA_TELEMETRY: GaTelemetry = {
	generationStarted(generation) {
		CURRENT_GENERATION.set(generation);
	},
	stagnationUpdated(stagnation) {
		STAGNATION_GENERATIONS.set(stagnation);
	},
	evaluationFailed(reason) {
		QLEARNING_TRAIN_ERRORS.inc({ reason });
	},
	genomeEvaluated(durationMs) {
		GENOME_EVALUATION_SECONDS.observe(durationMs / 1000);
	},
};

/** How far back from the session instant the signal window reaches. */
const SIGNAL_WINDOW_MS = 30 * 24 * 3_600_000;

interface AppContainerConfig {
	bufferSize: number;
	symbols: TradingSymbol[];
	settings: TrainingSettings;
	signalKeys: string[];
	modelDir: string;
	modelRetention: number;
	instanceId: string;
	history: CandleHistoryPort;
	signals: ConstructorParameters<typeof TrainingLoop>[4];
	/** FEATURE_SHARED_TRUNK (ADR-0076): all the symbols train as one group. */
	sharedTrunk?: boolean;
	/** Costs of each daily asset (ADR-0083); empty: crypto symbols only. */
	dailyCosts: ReadonlyMap<TradingSymbol, SimulatorCosts>;
}

class ApplicationContainer {
	public readonly symbols: TradingSymbol[];
	public readonly dataBuffer: MarketDataBuffer;
	public readonly trainer: Trainer;
	public readonly models: ModelArtifactStorePort;
	public readonly trainingLoop: TrainingLoop;

	constructor(config: AppContainerConfig) {
		this.symbols = config.symbols;
		const bufferConfig: MarketDataBufferConfig = {
			maxSize: config.bufferSize,
			maxMemoryBytes: 512 * 1024 * 1024,
			evictionPolicy: EvictionPolicy.Lru,
			signalKeys: config.signalKeys,
			onInconsistentCandle: (symbol) =>
				DAILY_BAR_ISSUES_TOTAL.inc({ symbol, issue: "ohlc_inconsistent" }),
			onDataAdded: (symbol, candleCount, symbolCount) => {
				MARKET_DATA_BUFFER_SIZE.set({ symbol: String(symbol) }, candleCount);
				MARKET_DATA_SYMBOLS.set(symbolCount);
			},
		};
		this.dataBuffer = new MarketDataBuffer(bufferConfig);

		const { instanceId } = config;
		const publisher = new ModelPublisher(MessageManager, {
			trainerId: "trader-trainer",
			instanceId,
		});
		this.models = new FileModelArtifactStore({
			root: config.modelDir,
			retention: config.modelRetention,
		});
		this.trainer = new Trainer(this.dataBuffer, {
			settings: config.settings,
			publisher,
			telemetry: PROMETHEUS_GA_TELEMETRY,
			dailyCosts: (symbol) => config.dailyCosts.get(symbol),
			models: this.models,
			instanceId,
			// Training is CPU-bound: off the thread that serves the API (issue #508).
			runner: runInWorker,
		});
		this.trainingLoop = new TrainingLoop(
			this.trainer,
			this.dataBuffer,
			config.history,
			config.settings,
			config.signals,
			new Set(config.dailyCosts.keys()),
			config.sharedTrunk ? config.symbols : undefined
		);
	}
}

interface TraderTrainerSettings {
	TRAINER_DATA_WINDOW: number;
	/** Comma-separated symbols, e.g. "BTCUSDT,ETHUSDT". */
	TRAINER_SYMBOLS: string;
	/** `SYMBOL:ASSET` pairs, comma-separated; empty: no signals read. */
	TRAINER_SYMBOL_ASSETS: string;
	/** `ASSET:type` pairs trained on daily bars; empty: none (ADR-0083). */
	TRAINER_ASSETS?: string;
	TRAINER_ASSET_COSTS?: Partial<Record<AssetType, Partial<SimulatorCosts>>>;
	TRAINER_VALIDATION_SPLIT: number;
	TRAINER_TEST_SPLIT: number;
	TRAINER_WALK_FORWARD_FOLDS: number;
	TRAINER_GENERATIONS: number;
	TRAINER_POPULATION_SIZE: number;
	TRAINER_TIME_BUDGET_MS: number;
	TRAINER_EPISODES_PER_INDIVIDUAL: number;
	TRAINER_FITNESS_TYPE: FitnessType;
	/** Feature flag (ADR-0039); false: `total_pnl` only. Default true. */
	FEATURE_RISK_ADJUSTED_FITNESS?: boolean;
	FEATURE_EVENT_DRIVEN_DECISIONS?: boolean;
	FEATURE_INPUT_MASK_GENE?: boolean;
	FEATURE_SHARED_TRUNK?: boolean;
	TRAINER_SHARED_TRUNK_SYMBOLS_PER_GENERATION?: number;
	TRAINER_INPUT_MASK_PROTECT_CANDLE?: boolean;
	TRAINER_OBSERVE_POSITION?: boolean;
	TRAINER_SEED_OFFSET?: number;
	FEATURE_ACTION_SPACE_GENE?: boolean;
	/** Signal metrics fed to the network; read only when FEATURE_SIGNAL_INPUTS is true. */
	TRAINER_SIGNAL_FEATURES?: string;
	FEATURE_SIGNAL_INPUTS?: boolean;
	TRAINER_MODEL_DIR: string;
	TRAINER_MODEL_RETENTION: number;
	INSTANCE_ID: string;
}

/** Builds the service container from the environment settings. */
export function createTraderTrainerContainer(
	settings: TraderTrainerSettings,
	history: CandleHistoryPort,
	signalHistory: SignalHistoryPort
): ApplicationContainer {
	const assets = parseAssets(
		parseCommaSeparated(settings.TRAINER_ASSETS ?? "")
	);
	const dailyCosts = new Map<TradingSymbol, SimulatorCosts>(
		[...assets].map(([asset, type]) => [
			asset,
			{
				...DEFAULT_ASSET_COSTS[type],
				...settings.TRAINER_ASSET_COSTS?.[type],
			},
		])
	);
	const bars = new SignalBarHistory(signalHistory, assets, (symbol, issue) =>
		DAILY_BAR_ISSUES_TOTAL.inc({ symbol, issue })
	);
	const signalKeys = settings.FEATURE_SIGNAL_INPUTS
		? parseCommaSeparated(settings.TRAINER_SIGNAL_FEATURES ?? "")
		: [];
	const symbols = [
		...new Set([
			...parseCommaSeparated(settings.TRAINER_SYMBOLS).map((symbol) =>
				TradingSymbol.of(symbol)
			),
			...dailyCosts.keys(),
		]),
	];
	return new ApplicationContainer({
		bufferSize: settings.TRAINER_DATA_WINDOW,
		symbols,
		dailyCosts,
		settings: {
			validationSplit: settings.TRAINER_VALIDATION_SPLIT,
			testSplit: settings.TRAINER_TEST_SPLIT,
			walkForwardFolds: settings.TRAINER_WALK_FORWARD_FOLDS,
			generations: settings.TRAINER_GENERATIONS,
			populationSize: settings.TRAINER_POPULATION_SIZE,
			timeBudgetMs: settings.TRAINER_TIME_BUDGET_MS,
			episodesPerIndividual: settings.TRAINER_EPISODES_PER_INDIVIDUAL,
			fitnessType: effectiveFitnessType(settings),
			observePosition: settings.TRAINER_OBSERVE_POSITION ?? true,
			actionSpaceGene: settings.FEATURE_ACTION_SPACE_GENE ?? false,
			eventDriven: settings.FEATURE_EVENT_DRIVEN_DECISIONS ?? false,
			seedOffset: settings.TRAINER_SEED_OFFSET ?? 0,
			inputGroups: settings.FEATURE_INPUT_MASK_GENE
				? inputGroupNames(signalKeys)
				: undefined,
			protectCandleGroup: settings.TRAINER_INPUT_MASK_PROTECT_CANDLE,
			symbolsPerGeneration: settings.FEATURE_SHARED_TRUNK
				? symbolsPerGeneration(
						settings.TRAINER_SHARED_TRUNK_SYMBOLS_PER_GENERATION,
						symbols.length
					)
				: undefined,
		},
		signalKeys,
		modelDir: settings.TRAINER_MODEL_DIR,
		modelRetention: settings.TRAINER_MODEL_RETENTION,
		instanceId: settings.INSTANCE_ID,
		history: {
			loadWindow: (symbol, at, size) =>
				(dailyCosts.has(symbol) ? bars : history).loadWindow(symbol, at, size),
		},
		signals: {
			history: signalHistory,
			assets: new Map(
				parseCommaSeparated(settings.TRAINER_SYMBOL_ASSETS).map((pair) => {
					const [symbol, asset] = pair.split(":");
					return [TradingSymbol.of(symbol), AssetId.parse(asset)];
				})
			),
			windowMs: SIGNAL_WINDOW_MS,
		},
	});
}

interface TrainingLeadershipSettings {
	/** Empty: no election, this instance trains. */
	TRAINER_LEASE_NAME: string;
	/** Holder identity in the Lease (the pod name in Kubernetes). */
	INSTANCE_ID: string;
}

/**
 * The training loop behind the trainer leadership (ADR-0058): it runs only
 * while this instance holds the Lease TRAINER_LEASE_NAME, or always without
 * one. Every instance serves the read routes either way.
 */
export function createTrainingLeadership(
	settings: TrainingLeadershipSettings,
	training: LeaderJob
): Leadership {
	let lease: ConstructorParameters<typeof Leadership>[0] = SOLE_INSTANCE_LEASE;
	if (settings.TRAINER_LEASE_NAME) {
		getLogger().info("Trainer leader election enabled", {
			context: {
				lease: settings.TRAINER_LEASE_NAME,
				identity: settings.INSTANCE_ID,
			},
		});
		lease = new KubernetesLease(
			settings.INSTANCE_ID,
			kubernetesLeaseApi(settings.TRAINER_LEASE_NAME)
		);
	}
	return new Leadership(
		lease,
		training,
		(leader) => TRAINING_LEADER.set(leader),
		"Trainer"
	);
}
