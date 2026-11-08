import { agentError } from "../../shared/errors";
import {
	createExperiencePool,
	type IExperiencePool,
	type IPrioritizedExperiencePool,
} from "./experience-pool";
import type { NeuralNetwork } from "./neural-network";
import { computeReplayTarget } from "./q-value-computer";
import type {
	Experience,
	NetworkArchitecture,
	QLearningExperience,
} from "./type";
import { ExperienceKind } from "./type";

function _isPrioritized(
	pool: IExperiencePool
): pool is IPrioritizedExperiencePool {
	return "sampleWithWeights" in pool;
}

function _trainReplayed(
	nn: NeuralNetwork,
	exp: Experience,
	discount: number,
	weight: number
): number {
	if (exp.kind !== ExperienceKind.QLearning) {
		throw agentError("Only Q-learning transitions can be replayed.");
	}
	const { target, tdError } = computeReplayTarget(nn, exp, discount, weight);
	nn.train(exp.input, target);
	return tdError;
}

export class AgentExperienceHandler {
	private readonly _pool: IExperiencePool;

	constructor(cfg: NetworkArchitecture) {
		const enablePool = cfg.enablePool ?? true;
		const poolMaxSize = cfg.poolMaxSize ?? 10_000;
		this._pool = createExperiencePool(
			enablePool,
			poolMaxSize,
			{
				prioritized: cfg.perEnabled ?? false,
				alpha: cfg.perAlpha ?? 0.6,
				beta: cfg.perBeta ?? 0.4,
				betaAnneal: cfg.perBetaAnneal ?? false,
			},
			cfg.rng
		);
	}

	/** Stores a complete transition for {@link replay}. */
	remember(exp: QLearningExperience): void {
		this._pool.add(exp);
	}

	getPool(): Experience[] {
		return this._pool.getPool();
	}

	clearPool(): void {
		this._pool.clearPool();
	}

	/**
	 * One experience-replay update: draws `batchSize` stored transitions
	 * (proportionally to their TD error with a prioritized pool, uniformly
	 * otherwise) and trains on each. Nothing happens until the pool holds a
	 * full batch. Returns the number of transitions trained on.
	 */
	replay(nn: NeuralNetwork, batchSize: number, discount: number): number {
		if (batchSize < 1 || this._pool.getPoolSize() < batchSize) {
			return 0;
		}
		if (_isPrioritized(this._pool)) {
			const sample = this._pool.sampleWithWeights(batchSize);
			const tdErrors = sample.experiences.map((exp, idx) =>
				_trainReplayed(nn, exp, discount, sample.weights[idx])
			);
			this._pool.updatePriorities(sample.ids, tdErrors);
			return tdErrors.length;
		}
		const batch = this._pool.samplePool(batchSize);
		for (const exp of batch) {
			_trainReplayed(nn, exp, discount, 1);
		}
		return batch.length;
	}
}
