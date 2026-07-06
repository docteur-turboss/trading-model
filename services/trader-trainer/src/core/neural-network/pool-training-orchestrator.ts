import type { FeedForwardEngine } from "./feed-forward-engine";
import type { BackpropEngine } from "./backprop-engine";
import { LearningPool } from "./pool-manager";
import type { ForwardContext, NeuralNetworkConfig } from "./type";

export interface PoolTrainingOrchestratorOptions {
	config: Required<NeuralNetworkConfig>;
	feedForward: FeedForwardEngine;
	backprop: BackpropEngine;
	poolManager: LearningPool;
}

export class PoolTrainingOrchestrator {
	private readonly _config: Required<NeuralNetworkConfig>;
	private readonly _feedForward: FeedForwardEngine;
	private readonly _backprop: BackpropEngine;
	private readonly _poolManager: LearningPool;

	constructor(options: PoolTrainingOrchestratorOptions) {
		this._config = options.config;
		this._feedForward = options.feedForward;
		this._backprop = options.backprop;
		this._poolManager = options.poolManager;
	}

	forwardAndPool(
		input: Float32Array,
		target: Float32Array,
	): number {
		const context = this._feedForward.forward(input);
		const loss = this._backprop.computeLoss(context.output, target);

		const experience = this._poolManager.createExperience({
			input,
			context,
			target,
			loss,
		});
		this._poolManager.push(experience, this._config.poolMaxSize);

		return loss;
	}

	trainPooled(): number {
		const pool = this._poolManager.getAll();
		if (pool.length === 0) {
			return 0;
		}

		const poolSize = pool.length;

		this._backprop.resetAccumulators();

		let totalLoss = 0;

		for (const experience of pool) {
			totalLoss += experience.loss;
			const context = this._poolManager.experienceToContext(experience);
			this._backprop.backpropAccumulate(context, experience.target);
		}

		this._backprop.applyAccumulatedGradients(poolSize);

		this._poolManager.clear();

		return totalLoss / poolSize;
	}
}
