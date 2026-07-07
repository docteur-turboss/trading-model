import { agentError } from "@trading-model/common/utils/errors";
import { createExperiencePool, type IExperiencePool } from "./experience-pool";
import type { NeuralNetwork } from "./neural-network";
import { computeQLearningTarget } from "./q-value-computer";
import type {
	Experience,
	NetworkArchitecture,
	QLearningExperience,
	SupervisedExperience,
} from "./type";

type LearnStrategy = (nn: NeuralNetwork, exp: Experience) => void;

const LEARN_STRATEGIES: Record<string, LearnStrategy> = {
	supervised: (nn: NeuralNetwork, exp: Experience) => {
		nn.train(exp.input, (exp as SupervisedExperience).target);
	},
	qlearning: (nn: NeuralNetwork, exp: Experience) => {
		const target = computeQLearningTarget(nn, exp as QLearningExperience, 0.99);
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

	private _buildExperience(
		input: Float32Array,
		output: Float32Array,
		reward?: number,
		nextState?: Float32Array,
		done?: boolean
	): Experience {
		return reward !== undefined && nextState !== undefined
			? {
					kind: "qlearning",
					input,
					output: output.slice(),
					reward,
					nextState,
					done: done ?? false,
				}
			: { kind: "bare", input, output: output.slice() };
	}

	recordExperience(
		input: Float32Array,
		output: Float32Array,
		reward?: number,
		nextState?: Float32Array,
		done?: boolean
	): void {
		this._pool.add(
			this._buildExperience(input, output, reward, nextState, done)
		);
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
			const strategy = LEARN_STRATEGIES[exp.kind];
			if (strategy) {
				strategy(nn, exp);
			}
		}
		this._pool.clearPool();
	}

	learnExperience(nn: NeuralNetwork, exp: Experience, gamma = 0.99): void {
		if (exp.kind !== "qlearning") {
			throw agentError(
				"Q-learning requires `reward` and `nextState` in the experience."
			);
		}
		const strategy = LEARN_STRATEGIES[exp.kind];
		if (!strategy) {
			throw agentError(`No learn strategy for experience kind: ${exp.kind}`);
		}
		const qlExp = exp as QLearningExperience;
		const adjustedExp = { ...qlExp, gamma };
		strategy(nn, adjustedExp as unknown as Experience);
		this._pool.remove(exp.input);
	}
}
