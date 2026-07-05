import type { Experience } from "../../core/neural-network/type";
import TradingAgent, { type TradingAgentConfig } from "../agent/trading-agent";
import { adaptGAControl } from "./adaptive-control-system";
import { createDefaultGenome } from "./factory";
import type {
	GAControlGenome,
	Genome,
	GenomeFitnessMeta,
	LamarckGenome,
	MarketStep,
} from "./genome-types";
import type { ObjectiveVector } from "./nsga2";
import { buildPopulationMeta } from "./nsga2";
import { createOffspring, selectElites } from "./offspring-factory";
import { evaluateFitness } from "./training-phase";
import { ParetoArchive } from "./pareto-engine";
import { makePRNG } from "./prng";
import { StagnationTracker } from "./stagnation-tracker";
import type { DeepReadonly } from "./shared-types";

export interface RLBackend {
	forwardPass(features: Float32Array): Float32Array;
	step(features: Float32Array, price: number): { reward: number };
	train(experience: Experience, gamma: number): void;
	getWeights(): Float32Array;
	setWeights(weights: Float32Array): void;
	getPnL(): number;
	resetEpisode(): void;
	getExperiencePool(): Experience[];
}

export type BackendFactory = (genome: DeepReadonly<LamarckGenome>) => RLBackend;

function deepFreeze<TValue>(obj: TValue): DeepReadonly<TValue> {
	if (obj === null || typeof obj !== "object") {
		return obj as DeepReadonly<TValue>;
	}

	if (ArrayBuffer.isView(obj)) {
		return obj as DeepReadonly<TValue>;
	}

	for (const key of Object.keys(obj)) {
		const val = (obj as Record<string, unknown>)[key];
		if (val !== null && typeof val === "object" && !Object.isFrozen(val)) {
			deepFreeze(val);
		}
	}

	return Object.freeze(obj) as DeepReadonly<TValue>;
}

function withGenome<TGenome extends Genome>(
	base: DeepReadonly<TGenome>,
	patch: Partial<TGenome>
): DeepReadonly<TGenome> {
	return deepFreeze({ ...base, ...patch } as TGenome) as DeepReadonly<TGenome>;
}

export function makeTradingAgentBackend(
	genome: DeepReadonly<LamarckGenome>
): RLBackend {
	const cfg = _buildAgentConfig(genome);
	const agent = new TradingAgent(cfg);
	_tryLamarckianInjection(agent, genome);

	return {
		forwardPass: (features) => agent.forwardPass(features).output,
		step: (features, price) => agent.step(features, price),
		train: (experience, gamma) => {
			try {
				agent.learnQLearning(experience, gamma);
			} catch {
				/* Q-learning error skipped */
			}
		},
		getWeights: () => agent.getWeights(),
		setWeights: (weights) => agent.setWeights(weights),
		getPnL: () => agent.wallet.getPnL(),
		resetEpisode: () => agent.resetEpisode(),
		getExperiencePool: () => agent.getExperiencePool(),
	};
}

function _buildAgentConfig(
	genome: DeepReadonly<LamarckGenome>
): TradingAgentConfig {
	const dp = genome.rl.discretePolicy;
	const rb = genome.rl.replayBuffer;

	return {
		nnConfig: {
			neuronsByLayer: [
				genome.network.inputDim,
				...genome.network.hiddenLayers.map((layer) => layer.neurons),
				genome.network.outputDim,
			],
			activationType: genome.network.hiddenLayers.map(
				(layer) => layer.activation
			),
			connectionType:
				genome.network.hiddenLayers[0]?.connectionType ?? "fully-connected",
			biasInitialisationType:
				genome.network.hiddenLayers[0]?.biasType ?? "random",
			normalisationType: genome.network.normalization,
			enablePool: true,
			poolMaxSize: rb.bufferSize,
		},
		wallet: { initialCash: 1000, initialPrice: 1 },
		actionSpace: "discrete",
		tradeAmount: 1,
		stateManagerCfg: {
			epsilonStart: dp.epsilonStart,
			epsilonMin: dp.epsilonMin,
			epsilonDecay: dp.epsilonDecay,
			gamma: genome.rl.gamma,
		},
	};
}

function _tryLamarckianInjection(
	agent: TradingAgent,
	genome: DeepReadonly<LamarckGenome>
): void {
	if (genome.trainedWeights) {
		try {
			agent.setWeights(new Float32Array(genome.trainedWeights));
		} catch {
			/* architecture mismatch after structural mutation */
		}
	}
}

export interface WindowSet {
	id: string;
	train: MarketStep[];
	validation: MarketStep[];
}

export interface GARunnerConfig {
	windowSets: WindowSet[];
	backendFactory: BackendFactory;
	evalConcurrency?: number;
	onGeneration?: (ctx: GenerationContext) => void;
	onArchiveUpdate?: (archive: DeepReadonly<LamarckGenome>[]) => void;
	initialControl?: Partial<GAControlGenome>;
}

export interface GenerationContext {
	generation: number;
	population: DeepReadonly<LamarckGenome>[];
	archive: DeepReadonly<LamarckGenome>[];
	bestFitness: number;
	bestGenome: DeepReadonly<LamarckGenome>;
	avgFitness: number;
	efficiencyScore: number;
	elapsedMs: number;
	stagnation: number;
	gaControl: DeepReadonly<GAControlGenome>;
}

export interface ParetoFrontContext {
	updatedPop: DeepReadonly<LamarckGenome>[];
	objectives: ObjectiveVector[];
	metas: GenomeFitnessMeta[];
	rng: () => number;
}

export class GeneticAlgorithmRunner {
	private _population: DeepReadonly<LamarckGenome>[] = [];
	private _generation = 0;
	private _startTime = 0;
	private _archive = new ParetoArchive();
	private _stagnationTracker = new StagnationTracker();

	constructor(private readonly _cfg: GARunnerConfig) {}

	public initialise(baseControl?: Partial<GAControlGenome>): void {
		const ctrl = deepFreeze({
			...createDefaultGenome("base").gaControl,
			...baseControl,
		} as GAControlGenome);

		this._population = Array.from(
			{ length: ctrl.populationSize },
			(_unused, index) => {
				const baseGenome = createDefaultGenome(
					`g0_${index}`,
					0
				) as LamarckGenome;
				return deepFreeze({
					...baseGenome,
					gaControl: ctrl,
					trainedWeights: undefined,
				}) as DeepReadonly<LamarckGenome>;
			}
		);

		this._generation = 0;
		this._startTime = Date.now();
		this._archive = new ParetoArchive();
		this._stagnationTracker = new StagnationTracker();
	}

	public async runGeneration(): Promise<GenerationContext> {
		const ctrl = this._population[0].gaControl;
		const rng = makePRNG(ctrl.mutationSeed + this._generation);

		const { updatedPop, objectives, metas } = await this._evaluateFitness();
		const { popWithMeta, popMeta, avgFit, avgEff } = this._buildParetoFronts({
			updatedPop,
			objectives,
			metas,
			rng,
		});

		this._updateArchive(popWithMeta, objectives, popMeta);

		const newCtrl = adaptGAControl(
			ctrl,
			this._stagnationTracker.efficiencyHistory,
			this._stagnationTracker.stagnation
		);

		this._stagnationTracker.track(popWithMeta, metas, avgEff);

		const ranked = this._sortPopulation(popWithMeta, popMeta);

		const elites = selectElites(ranked, newCtrl);
		const offspring = createOffspring({
			ranked,
			newCtrl,
			ctrl,
			rng,
			generation: this._generation,
		});

		this._population = [...elites, ...offspring].slice(
			0,
			newCtrl.populationSize
		);
		this._generation++;

		return this._buildContext(newCtrl, avgFit, avgEff);
	}

	private _buildContext(
		newCtrl: Readonly<GAControlGenome>,
		avgFit: number,
		avgEff: number
	): GenerationContext {
		const ctx: GenerationContext = {
			generation: this._generation,
			population: this._population,
			archive: this._archive.members,
			bestFitness: this._stagnationTracker.bestFitness,
			bestGenome: this._stagnationTracker.bestGenome as DeepReadonly<LamarckGenome>,
			avgFitness: avgFit,
			efficiencyScore: avgEff,
			elapsedMs: Date.now() - this._startTime,
			stagnation: this._stagnationTracker.stagnation,
			gaControl: newCtrl,
		};

		this._cfg.onGeneration?.(ctx);
		return ctx;
	}

	private async _evaluateFitness(): Promise<{
		updatedPop: DeepReadonly<LamarckGenome>[];
		objectives: ObjectiveVector[];
		metas: GenomeFitnessMeta[];
	}> {
		const concurrency = this._cfg.evalConcurrency ?? 4;

		return evaluateFitness({
			population: this._population,
			windowSets: this._cfg.windowSets,
			backendFactory: this._cfg.backendFactory,
			concurrency,
		});
	}

	private _buildParetoFronts(
		ctx: ParetoFrontContext
	): {
		popWithMeta: DeepReadonly<LamarckGenome>[];
		popMeta: import("./nsga2").PopulationMeta;
		avgFit: number;
		avgEff: number;
	} {
		const { updatedPop, objectives, metas, rng } = ctx;
		const popMeta = buildPopulationMeta(objectives, rng);

		const popWithMeta = updatedPop.map((genome, idx) =>
			withGenome(genome, {
				fitness: metas[idx].efficiencyScore,
				fitnessMeta: metas[idx],
			} as Partial<LamarckGenome>)
		);

		const avgFit =
			popWithMeta.reduce((sum, genome) => sum + (genome.fitness ?? 0), 0) /
			popWithMeta.length;
		const avgEff =
			metas.reduce((sum, meta) => sum + meta.efficiencyScore, 0) / metas.length;

		return { popWithMeta, popMeta, avgFit, avgEff };
	}

	private _sortPopulation(
		popWithMeta: DeepReadonly<LamarckGenome>[],
		popMeta: import("./nsga2").PopulationMeta
	): Genome[] {
		const sortedIdx = Array.from(
			{ length: popWithMeta.length },
			(_unused, idx) => idx
		).sort((idxA, idxB) =>
			popMeta.paretoRank[idxA] === popMeta.paretoRank[idxB]
				? popMeta.crowdingDist[idxB] - popMeta.crowdingDist[idxA]
				: popMeta.paretoRank[idxA] - popMeta.paretoRank[idxB]
		);

		return sortedIdx.map((idx) => popWithMeta[idx] as Genome);
	}

	private _updateArchive(
		popWithMeta: DeepReadonly<LamarckGenome>[],
		objectives: ObjectiveVector[],
		popMeta: import("./nsga2").PopulationMeta
	): void {
		const frontIdx = popMeta.paretoRank.reduce((acc, rank, idx) => {
			if (rank === 0) {
				acc.push(idx);
			}
			return acc;
		}, [] as number[]);
		if (
			this._archive.update(
				frontIdx.map((idx) => popWithMeta[idx]),
				frontIdx.map((idx) => objectives[idx])
			)
		) {
			this._cfg.onArchiveUpdate?.(this._archive.members);
		}
	}

	public async run(): Promise<DeepReadonly<LamarckGenome>> {
		this.initialise(this._cfg.initialControl);

		while (true) {
			const ctx = await this.runGeneration();
			const ctrl = ctx.gaControl;
			if (ctx.bestFitness >= ctrl.rewardThreshold) {
				break;
			}
			if (ctx.stagnation >= ctrl.stagnationPatience) {
				break;
			}
			if (ctx.generation >= ctrl.maxGenerations) {
				break;
			}
			if (ctx.elapsedMs >= ctrl.timeBudgetMs) {
				break;
			}
		}

		return this._archive.members[0] ?? this._stagnationTracker.bestGenome ?? this._population[0];
	}

	public getPopulation(): DeepReadonly<LamarckGenome>[] {
		return this._population;
	}
	public getBestGenome(): DeepReadonly<LamarckGenome> | null {
		return this._stagnationTracker.bestGenome;
	}
	public getArchive(): DeepReadonly<LamarckGenome>[] {
		return this._archive.members;
	}
	public getGeneration(): number {
		return this._generation;
	}
}
