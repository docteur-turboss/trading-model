import type { Reward } from "@trading-model/common/domain/primitives";
import { agentError } from "@trading-model/common/utils/errors";
import type { NeuralNetwork } from "../../domain/neural-network/neural-network";
import { createExperiencePool, type IExperiencePool } from "./experience-pool";
import { computeQLearningTarget } from "./q-value-computer";
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
		const target = computeQLearningTarget(nn, exp, 0.99);
		nn.train(exp.input, target);
	},
};

export class AgentExperienceHandler {
	private readonly _pool: IExperiencePool;

	constructor(cfg: NetworkArchitecture) {
		const enablePool = cfg.enablePool ?? true;
		const poolMaxSize = cfg.poolMaxSize ?? 10_000;
		this._pool = createExperiencePool(enablePool, poolMaxSize);
	}

	private _buildExperience(ei: ExperienceInput): Experience {
		const { input, output, reward, nextState, done } = ei;
		return reward !== undefined && nextState !== undefined
			? {
					kind: ExperienceKind.QLearning,
					input,
					output: output.slice(),
					reward: reward as unknown as Reward,
					nextState,
					done: done ?? false,
				}
			: { kind: ExperienceKind.Bare, input, output: output.slice() };
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
