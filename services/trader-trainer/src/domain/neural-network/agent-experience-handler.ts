import type { Reward } from "@trading-model/primitives/primitives";
import { agentError } from "../../shared/errors";
import {
	createExperiencePool,
	type IExperiencePool,
	type IPrioritizedExperiencePool,
} from "./experience-pool";
import type { NeuralNetwork } from "./neural-network";
import {
	computeQLearningTarget,
	computeReplayTarget,
} from "./q-value-computer";
import type {
	Experience,
	NetworkArchitecture,
	QLearningExperience,
} from "./type";
import { ExperienceKind } from "./type";

export interface ExperienceInput {
	input: Float32Array;
	output: Float32Array;
	reward?: number;
	nextState?: Float32Array;
	done?: boolean;
	action?: number;
}

type LearnStrategyMap = {
	[Kind in Experience["kind"]]?: (
		nn: NeuralNetwork,
		exp: Extract<Experience, { kind: Kind }>
	) => void;
};

const LEARN_STRATEGIES: LearnStrategyMap = {
	[ExperienceKind.Supervised]: (nn, exp) => {
		nn.train(exp.input, exp.target);
	},
	[ExperienceKind.QLearning]: (nn, exp) => {
		const gamma =
			(exp as QLearningExperience & { gamma?: number }).gamma ?? 0.99;
		const target = computeQLearningTarget(nn, exp, gamma);
		nn.train(exp.input, target);
	},
};

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

	private _buildExperience(ei: ExperienceInput): Experience {
		const { input, output, reward, nextState, done, action } = ei;
		return reward !== undefined &&
			nextState !== undefined &&
			action !== undefined
			? {
					kind: ExperienceKind.QLearning,
					input,
					output: output.slice(),
					reward: reward as unknown as Reward,
					nextState,
					done: done ?? false,
					action,
				}
			: { kind: ExperienceKind.Bare, input, output: output.slice(), action };
	}

	/** Stores a complete transition for {@link replay}. */
	remember(exp: QLearningExperience): void {
		this._pool.add(exp);
	}

	recordExperience(ei: ExperienceInput): void {
		this._pool.add(this._buildExperience(ei));
	}

	getPool(): Experience[] {
		return this._pool.getPool();
	}

	getPoolSize(): number {
		return this._pool.getPoolSize();
	}

	clearPool(): void {
		this._pool.clearPool();
	}

	samplePool(batchSize: number): Experience[] {
		return this._pool.samplePool(batchSize);
	}

	removeFromPool(input: Float32Array): void {
		this._pool.remove(input);
	}

	learnFromPool(nn: NeuralNetwork): void {
		for (const exp of this._pool.values()) {
			const strategy = LEARN_STRATEGIES[exp.kind] as
				| ((nn: NeuralNetwork, exp: Experience) => void)
				| undefined;
			if (strategy) {
				strategy(nn, exp);
			}
		}
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

	learnExperience(nn: NeuralNetwork, exp: Experience, gamma = 0.99): void {
		if (exp.kind !== ExperienceKind.QLearning) {
			throw agentError(
				"Q-learning requires `reward` and `nextState` in the experience."
			);
		}
		const qlExp = exp as QLearningExperience;
		const adjustedExp = { ...qlExp, gamma };
		LEARN_STRATEGIES[ExperienceKind.QLearning]!(nn, adjustedExp);
		this._pool.remove(exp.input);
	}
}
