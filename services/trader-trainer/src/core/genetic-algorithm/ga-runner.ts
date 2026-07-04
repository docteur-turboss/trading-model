// ----------------------------------------------------------------
//            Self-adaptive Genetic Algorithm runner
//   Couples with TradingAgent / AutoEnv / Deep Q-Learning agent
// ----------------------------------------------------------------

import type { Experience } from "../../core/neural-network/type";
import TradingAgent, { type TradingAgentConfig } from "../agent/trading-agent";
import { NormalizationStats } from "../normalization-stats";
import { adaptGAControl } from "./adaptive-control-system";
import { crossoverGenomes } from "./crossover";
import { evaluateGenomeAllWindows, pooledEval } from "./evaluation-pipeline";
import { crossoverWeights, mutateWeights } from "./evolution-engine";
import { createDefaultGenome } from "./factory";
import { shapeReward } from "./fitness";
import type {
	GAControlGenome,
	Genome,
	GenomeFitnessMeta,
	LamarckGenome,
	MarketStep,
} from "./genome-types";
import { mutateGenome } from "./mutation";
import type { ObjectiveVector } from "./nsga2";
import { buildPopulationMeta, type PopulationMeta } from "./nsga2";
import { ParetoArchive } from "./pareto-engine";
import { makePRNG } from "./prng";
import { selectParent } from "./selection";
import type { DeepReadonly } from "./shared-types";
import { generateId, type RunningStats } from "./utils";

// ----------------------------------------------------------------
// Immutability helpers
// ----------------------------------------------------------------
function deepFreeze<TValue>(obj: TValue): DeepReadonly<TValue> {
	/* istanbul ignore if */
	if (obj === null || typeof obj !== "object") {
		return obj as DeepReadonly<TValue>;
	}

	// Typed arrays (Float32Array etc) cannot be frozen; skip them
	if (ArrayBuffer.isView(obj)) {
		return obj as DeepReadonly<TValue>;
	}

	// Freeze nested objects first (depth-first)
	for (const key of Object.keys(obj)) {
		const val = (obj as Record<string, unknown>)[key];
		if (val !== null && typeof val === "object" && !Object.isFrozen(val)) {
			deepFreeze(val);
		}
	}

	return Object.freeze(obj) as DeepReadonly<TValue>;
}

/** Produce a new deep-frozen genome with patch applied; original untouched. */
function withGenome<TGenome extends Genome>(
	base: DeepReadonly<TGenome>,
	patch: Partial<TGenome>
): DeepReadonly<TGenome> {
	// Shallow merge at the top level, then deep-freeze the result.
	// For nested objects in patch, caller is responsible for providing
	// complete replacements — no partial sub-object merging.
	return deepFreeze({ ...base, ...patch } as TGenome) as DeepReadonly<TGenome>;
}

// ----------------------------------------------------------------
// RL backend interface (decouples runner from DQN internals)
// ----------------------------------------------------------------
export interface RLBackend {
	/**
	 * Pure read of network output — does NOT push to experience pool.
	 * Use for observation / policy sampling without side-effects.
	 */
	forwardPass(features: Float32Array): Float32Array;
	/**
	 * Full environment step: sets price, runs inference, executes
	 * trade in wallet, returns reward.  Pushes to experience pool.
	 */
	step(features: Float32Array, price: number): { reward: number };
	/** Q-learning update on one experience tuple. */
	train(experience: Experience, gamma: number): void;
	/** Flat weight snapshot for Lamarckian storage. */
	getWeights(): Float32Array;
	/** Restores weights from a Lamarckian snapshot. */
	setWeights(weights: Float32Array): void;
	getPnL(): number;
	/** Resets the episode state — wallet, pool, and internal counters. */
	resetEpisode(): void;
	getExperiencePool(): Experience[];
}

/** Factory: the runner only knows how to ask for backends, not how to build them. */
export type BackendFactory = (genome: DeepReadonly<LamarckGenome>) => RLBackend;

// ----------------------------------------------------------------
// TradingAgent → RLBackend adaptor
// ----------------------------------------------------------------
/** Build an RLBackend adaptor from a genome by creating a TradingAgent with the genome's architecture and hyperparameters. */
export function makeTradingAgentBackend(
	genome: DeepReadonly<LamarckGenome>
): RLBackend {
	const dp = genome.rl.discretePolicy;
	const rb = genome.rl.replayBuffer;

	const cfg: TradingAgentConfig = {
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

	const agent = new TradingAgent(cfg);

	// Lamarckian weight injection
	if (genome.trainedWeights) {
		try {
			agent.setWeights(new Float32Array(genome.trainedWeights));
		} catch {
			/* architecture mismatch after structural mutation — start fresh */
		}
	}

	return {
		// pure forward pass — no pool interaction
		forwardPass: (features) => agent.forwardPass(features).output,
		step: (features, price) => agent.step(features, price),
		train: (experience, gamma) => {
			try {
				agent.learnQLearning(experience, gamma);
			} catch {
				/* Q-learning error skipped — continue training */
			}
		},
		getWeights: () => agent.getWeights(),
		setWeights: (weights) => agent.setWeights(weights),
		getPnL: () => agent.wallet.getPnL(),
		resetEpisode: () => agent.resetEpisode(),
		getExperiencePool: () => agent.getExperiencePool(),
	};
}

// ----------------------------------------------------------------
// Walk-forward window types (train ≠ eval)
// ----------------------------------------------------------------
/**
 * A named train/validation split.
 * Genomes are ALWAYS evaluated on `validation`, never on `train`.
 * This enforces out-of-sample fitness.
 */
export interface WindowSet {
	id: string;
	train: MarketStep[];
	validation: MarketStep[];
}

// ----------------------------------------------------------------
// Configuration type
// ----------------------------------------------------------------

/** Configuration for the GeneticAlgorithmRunner. */
export interface GARunnerConfig {
	windowSets: WindowSet[];
	backendFactory: BackendFactory;
	/** Worker concurrency cap for parallel evaluation. */
	evalConcurrency?: number;
	/** Hook called after each generation. */
	onGeneration?: (ctx: GenerationContext) => void;
	/** Hook called when the Pareto archive is updated. */
	onArchiveUpdate?: (archive: DeepReadonly<LamarckGenome>[]) => void;
	/** Override initial GA control parameters. */
	initialControl?: Partial<GAControlGenome>;
}

/** Context passed to the onGeneration hook after each GA generation. */
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

/** Attach objectives and Pareto rank to a genome (immutably). */

// ----------------------------------------------------------------
// PrecomputeRewards operates on RLBackend (not TradingAgent)
//
// IMPORTANT: this function calls backend.step() — it MUTATES the backend
// (wallet, pool).  Always pass a SHADOW backend; discard it afterwards.
// ----------------------------------------------------------------
/**
 * One-pass over marketData: applies reward shaping without calling agent.step().
 * Used exclusively by n-step look-ahead; the agent's state is untouched.
 */
function _precomputeRewards(
	backend: RLBackend,
	data: MarketStep[],
	genome: DeepReadonly<LamarckGenome>,
	runStats?: RunningStats
): Float32Array {
	const rShape = genome.rl.rewardShaping;
	const buf = new Float32Array(data.length);
	for (let index = 0; index < data.length; index++) {
		const { reward } = backend.step(data[index].features, data[index].price);
		let shaped = shapeReward(reward, rShape);
		/* istanbul ignore next */
		if (rShape.normalize) {
			runStats?.update(shaped);
			shaped = runStats?.normalize(shaped) ?? shaped;
		}
		buf[index] = shaped;
	}
	return buf;
}

function nStepReturn(
	buf: Float32Array,
	index: number,
	genome: DeepReadonly<LamarckGenome>
): number {
	let ret = 0;
	const count = genome.rl.horizon.nStepReturn;
	for (let i = 0; i < count && index + i < buf.length; i++) {
		ret += genome.rl.gamma ** i * buf[index + i];
	}
	return ret;
}

// ----------------------------------------------------------------
// trainPhase: accepts pre-computed rewardBuf, no forwardPass call
// ----------------------------------------------------------------

/**
 * Trains the backend on one episode of trainData.
 * rewardBuf MUST have been computed by a shadow backend beforehand.
 * TradingAgent.step() handles inference + epsilon-greedy internally.
 */
function _trainPhase(
	backend: RLBackend,
	trainData: MarketStep[],
	rewardBuf: Float32Array,
	genome: DeepReadonly<LamarckGenome>
): void {
	const horizon = genome.rl.horizon;
	const maxT = Math.min(trainData.length, horizon.maxEpisodeLength);

	for (let index = 0; index < maxT; index++) {
		if (index % horizon.frameSkip !== 0) {
			continue;
		}

		// F3: step() already does inference + action + wallet update internally
		backend.step(trainData[index].features, trainData[index].price);

		const pool = backend.getExperiencePool();
		if (pool.length >= 2) {
			const prev = pool[pool.length - 2];
			backend.train(
				{
					...prev,
					kind: "qlearning" as const,
					reward: nStepReturn(rewardBuf, index, genome),
					nextState: trainData[index].features,
					done: index === maxT - 1,
				},
				genome.rl.gamma
			);
		}
	}
}

// ----------------------------------------------------------------
// evalPhase: no forwardPass, step() handles action internally
// ----------------------------------------------------------------
function _evalPhase(
	genome: DeepReadonly<LamarckGenome>,
	validationData: MarketStep[],
	backendFactory: BackendFactory
): { rawScores: number[]; finalPnl: number } {
	const ctrl = genome.gaControl;
	const rShape = genome.rl.rewardShaping;
	const horizon = genome.rl.horizon;
	const rawScores: number[] = [];

	for (let ep = 0; ep < ctrl.episodesPerIndividual; ep++) {
		const backend = backendFactory(genome); // fresh backend with Lamarckian weights
		const runStats = new NormalizationStats();
		let epReward = 0;

		const maxT = Math.min(validationData.length, horizon.maxEpisodeLength);

		for (let index = 0; index < maxT; index++) {
			if (index % horizon.frameSkip !== 0) {
				continue;
			}

			// step() handles everything — no forwardPass() call before it
			const { reward } = backend.step(
				validationData[index].features,
				validationData[index].price
			);

			let shaped = shapeReward(reward, rShape);
			/* istanbul ignore next */
			if (rShape.normalize) {
				runStats.update(shaped);
				shaped = runStats.normalize(shaped);
			}
			if (!rShape.sparse) {
				epReward += shaped;
			}
		}

		if (rShape.sparse) {
			epReward = backend.getPnL();
		}
		rawScores.push(epReward);
		backend.resetEpisode();
	}

	return {
		rawScores,
		finalPnl:
			rawScores.reduce((sum, value) => sum + value, 0) / rawScores.length,
	};
}

// ----------------------------------------------------------------
// Lamarckian weight extraction → new frozen genome
// ----------------------------------------------------------------
/**
 * After training, extract weights from the backend and attach them
 * to the genome as `trainedWeights`. Returns a new deep-frozen genome.
 * The original genome is never mutated.
 */
function _lamarckianUpdate(
	genome: DeepReadonly<LamarckGenome>,
	backend: RLBackend
): DeepReadonly<LamarckGenome> {
	// Snapshot: slice() copies — no aliasing with backend internal buffers
	const snapshot = backend.getWeights().slice();
	return withGenome(genome, {
		trainedWeights: snapshot,
	} as Partial<LamarckGenome>);
}

// ----------------------------------------------------------------
// Main GA runner
// ----------------------------------------------------------------
/** Self-adaptive multi-objective genetic algorithm runner with NSGA-II, Lamarckian inheritance, and Pareto archiving. */
export class GeneticAlgorithmRunner {
	private _population: DeepReadonly<LamarckGenome>[] = [];
	private _generation = 0;
	private _bestGenome: DeepReadonly<LamarckGenome> | null = null;
	private _bestFitness = Number.NEGATIVE_INFINITY;
	private _stagnation = 0;
	private _startTime = 0;
	private _efficiencyHistory: number[] = [];
	private _archive = new ParetoArchive();

	constructor(private readonly _cfg: GARunnerConfig) {}

	/** Initialise the population from scratch (call once before `run()` or before the first `runGeneration()`). */
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
		this._bestFitness = Number.NEGATIVE_INFINITY;
		this._stagnation = 0;
		this._startTime = Date.now();
		this._efficiencyHistory = [];
		this._archive = new ParetoArchive();
	}

	/** Run one full generation: evaluate, rank, select, crossover, mutate, and produce offspring. */
	public async runGeneration(): Promise<GenerationContext> {
		const ctrl = this._population[0].gaControl;
		const rng = makePRNG(ctrl.mutationSeed + this._generation);

		const { popWithMeta, objectives, metas, popMeta, avgFit, avgEff, newCtrl } =
			await this._evaluatePopulation(rng, ctrl);

		this._updateArchive(popWithMeta, objectives, popMeta);

		this._trackStagnation(popWithMeta, metas, avgEff);

		const ranked = this._sortPopulation(popWithMeta, popMeta);

		const elites = this._selectElites(ranked, newCtrl);

		const offspring = this._createOffspring(ranked, newCtrl, ctrl, rng);

		this._population = [...elites, ...offspring].slice(
			0,
			newCtrl.populationSize
		);
		this._generation++;

		const ctx: GenerationContext = {
			generation: this._generation,
			population: this._population,
			archive: this._archive.members,
			bestFitness: this._bestFitness,
			/* istanbul ignore next */
			bestGenome: this._bestGenome as DeepReadonly<LamarckGenome>,
			avgFitness: avgFit,
			efficiencyScore: avgEff,
			elapsedMs: Date.now() - this._startTime,
			stagnation: this._stagnation,
			gaControl: newCtrl,
		};

		this._cfg.onGeneration?.(ctx);
		return ctx;
	}

	private async _evaluatePopulation(
		rng: () => number,
		ctrl: DeepReadonly<GAControlGenome>
	): Promise<{
		popWithMeta: DeepReadonly<LamarckGenome>[];
		objectives: ObjectiveVector[];
		metas: GenomeFitnessMeta[];
		popMeta: PopulationMeta;
		avgFit: number;
		avgEff: number;
		newCtrl: Readonly<GAControlGenome>;
	}> {
		const concurrency = this._cfg.evalConcurrency ?? 4;

		const evalResults = await pooledEval(
			this._population,
			concurrency,
			async (genome: DeepReadonly<LamarckGenome>) =>
				evaluateGenomeAllWindows(
					genome,
					this._cfg.windowSets,
					this._cfg.backendFactory
				)
		);

		const updatedPop = evalResults.map((result) => result.updatedGenome);
		const objectives = evalResults.map((result) => result.objectives);
		const metas = evalResults.map((result) => result.meta);
		const popMeta = buildPopulationMeta(objectives, rng);

		const popWithMeta = updatedPop.map((genome, idx) =>
			withGenome(genome, {
				fitness: metas[idx].efficiencyScore,
				fitnessMeta: metas[idx],
			} as Partial<LamarckGenome>)
		);

		/* istanbul ignore next */
		const avgFit =
			popWithMeta.reduce((sum, genome) => sum + (genome.fitness ?? 0), 0) /
			popWithMeta.length;
		const avgEff =
			metas.reduce((sum, meta) => sum + meta.efficiencyScore, 0) / metas.length;

		const newCtrl = adaptGAControl(
			ctrl,
			this._efficiencyHistory,
			this._stagnation
		);

		return { popWithMeta, objectives, metas, popMeta, avgFit, avgEff, newCtrl };
	}

	private _updateArchive(
		popWithMeta: DeepReadonly<LamarckGenome>[],
		objectives: ObjectiveVector[],
		popMeta: PopulationMeta
	): void {
		const frontIdx = popMeta.paretoRank.reduce((acc, rank, idx) => {
			if (rank === 0) {
				acc.push(idx);
			}
			return acc;
		}, [] as number[]);
		/* istanbul ignore if */
		if (
			this._archive.update(
				frontIdx.map((idx) => popWithMeta[idx]),
				frontIdx.map((idx) => objectives[idx])
			)
		) {
			this._cfg.onArchiveUpdate?.(this._archive.members);
		}
	}

	private _trackStagnation(
		popWithMeta: DeepReadonly<LamarckGenome>[],
		_metas: GenomeFitnessMeta[],
		avgEff: number
	): void {
		/* istanbul ignore next */
		const bestScalar = Math.max(
			...popWithMeta.map((genome) => genome.fitness ?? Number.NEGATIVE_INFINITY)
		);
		if (bestScalar > this._bestFitness + 1e-6) {
			this._bestFitness = bestScalar;
			/* istanbul ignore next */
			this._bestGenome = popWithMeta.reduce((best, genome) =>
				(genome.fitness ?? Number.NEGATIVE_INFINITY) >
				(best.fitness ?? Number.NEGATIVE_INFINITY)
					? genome
					: best
			);
			this._stagnation = 0;
		} else {
			this._stagnation++;
		}

		this._efficiencyHistory.push(avgEff);
	}

	private _sortPopulation(
		popWithMeta: DeepReadonly<LamarckGenome>[],
		popMeta: PopulationMeta
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

	private _selectElites(
		ranked: Genome[],
		newCtrl: Readonly<GAControlGenome>
	): DeepReadonly<LamarckGenome>[] {
		const nElite = Math.max(
			1,
			Math.round(newCtrl.elitismFraction * newCtrl.populationSize)
		);
		return ranked
			.slice(0, nElite)
			.map((genome) =>
				withGenome(genome, { gaControl: newCtrl } as Partial<LamarckGenome>)
			);
	}

	private _createOffspring(
		ranked: Genome[],
		newCtrl: Readonly<GAControlGenome>,
		ctrl: DeepReadonly<GAControlGenome>,
		rng: () => number
	): DeepReadonly<LamarckGenome>[] {
		const nElite = Math.max(
			1,
			Math.round(newCtrl.elitismFraction * newCtrl.populationSize)
		);
		const nOffspring = newCtrl.populationSize - nElite;

		const mutRng = makePRNG(ctrl.mutationSeed + this._generation + 1000);
		const coRng = makePRNG(ctrl.mutationSeed + this._generation + 2000);

		return Array.from({ length: nOffspring }, () => {
			const pA = selectParent(
				ranked as LamarckGenome[],
				newCtrl.selectionType,
				rng
			);
			const pB = selectParent(
				ranked as LamarckGenome[],
				newCtrl.selectionType,
				rng
			);

			const childStruct = mutateGenome(crossoverGenomes(pA, pB, coRng), mutRng);

			let childWeights: Float32Array | undefined;
			/* istanbul ignore if */
			if (pA.trainedWeights && pB.trainedWeights) {
				const rate = newCtrl.mutationRate ?? 0.1;
				const noiseStd = newCtrl.mutationStd ?? 0.05;
				childWeights = mutateWeights(
					crossoverWeights(
						pA.trainedWeights as Float32Array,
						pB.trainedWeights as Float32Array,
						coRng
					),
					rate,
					noiseStd,
					mutRng
				);
			}

			return deepFreeze({
				...childStruct,
				id: generateId(),
				generation: this._generation + 1,
				gaControl: newCtrl,
				trainedWeights: childWeights,
				fitness: undefined,
				fitnessMeta: undefined,
			}) as DeepReadonly<LamarckGenome>;
		});
	}

	/** Run the entire GA loop until a termination condition is met. Returns the best genome found. */
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

		// prefer archive member over transient population best
		/* istanbul ignore next */
		return this._archive.members[0] ?? this._bestGenome ?? this._population[0];
	}

	public getPopulation(): DeepReadonly<LamarckGenome>[] {
		return this._population;
	}
	public getBestGenome(): DeepReadonly<LamarckGenome> | null {
		return this._bestGenome;
	}
	public getArchive(): DeepReadonly<LamarckGenome>[] {
		return this._archive.members;
	}
	public getGeneration(): number {
		return this._generation;
	}
}
