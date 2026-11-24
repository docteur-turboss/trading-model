import { agentError } from "@trading-model/model-runtime/errors";
import type {
	Experience,
	NeuralNetworkConfig,
	QLearningExperience,
} from "@trading-model/model-runtime/neural-network/type";
import {
	ExperienceKind,
	mergeConfig,
} from "@trading-model/model-runtime/neural-network/type";
import {
	createExperiencePool,
	type ExperiencePoolPort,
	type PrioritizedExperiencePoolPort,
} from "./experience-pool";
import type { NeuralNetwork } from "./neural-network";
import { computeReplayTarget } from "./q-value-computer";

function _isPrioritized(
	pool: ExperiencePoolPort
): pool is PrioritizedExperiencePoolPort {
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
	const { target, tdError, context } = computeReplayTarget(
		nn,
		exp,
		discount,
		weight
	);
	nn.trainFrom(context, target);
	return tdError;
}

export class AgentExperienceHandler {
	private readonly _pool: ExperiencePoolPort;

	constructor(cfg: NeuralNetworkConfig) {
		const merged = mergeConfig(cfg);
		this._pool = createExperiencePool(
			merged.poolMaxSize,
			{
				prioritized: merged.perEnabled,
				alpha: merged.perAlpha,
				beta: merged.perBeta,
				betaAnneal: merged.perBetaAnneal,
			},
			merged.rng
		);
	}

	/** Stores a complete transition for {@link replay}. */
	remember(exp: QLearningExperience): void {
		this._pool.add(exp);
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
