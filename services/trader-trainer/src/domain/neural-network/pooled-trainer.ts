import { agentError } from "@trading-model/common/utils/errors";
import type { BackpropEngine } from "./backprop-engine";
import type { FeedForwardEngine } from "./feed-forward-engine";
import type { LearningPool } from "./pool-manager";
import type { NeuralNetworkConfig, PooledExperience } from "./type";

function _validateInputDim(
	input: Float32Array,
	config: Required<NeuralNetworkConfig>
): void {
	const expectedInput = config.neuronsByLayer[0];
	if (input.length !== expectedInput) {
		throw agentError(
			`Expected input size ${expectedInput}, got ${input.length}`
		);
	}
}

function _validateOutputDim(
	target: Float32Array,
	config: Required<NeuralNetworkConfig>
): void {
	const expectedOutput =
		config.neuronsByLayer[config.neuronsByLayer.length - 1];
	if (target.length !== expectedOutput) {
		throw agentError(
			`Expected target size ${expectedOutput}, got ${target.length}`
		);
	}
}

function _validateDimensions(
	input: Float32Array,
	target: Float32Array,
	config: Required<NeuralNetworkConfig>
): void {
	_validateInputDim(input, config);
	_validateOutputDim(target, config);
}

export class PooledTrainer {
	constructor(
		private readonly _feedForward: FeedForwardEngine,
		private readonly _backprop: BackpropEngine,
		private readonly _poolManager: LearningPool,
		private readonly _config: Required<NeuralNetworkConfig>
	) {}

	train(inputs: Float32Array, targets: Float32Array): number {
		_validateDimensions(inputs, targets, this._config);
		const context = this._feedForward.forward(inputs);
		this._backprop.backprop(context, targets);
		return this._backprop.computeLoss(context.output, targets);
	}

	forwardAndPool(input: Float32Array, target: Float32Array): number {
		if (!this._config.enablePool) {
			throw agentError(
				"Learning pool is disabled. Set enablePool: true in config."
			);
		}

		_validateDimensions(input, target, this._config);

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
		if (!this._config.enablePool) {
			throw agentError(
				"Learning pool is disabled. Set enablePool: true in config."
			);
		}
		const pool = this._poolManager.getAll();
		if (pool.length === 0) {
			return 0;
		}
		return this._trainPooledBatch(pool);
	}

	private _trainPooledBatch(pool: PooledExperience[]): number {
		const poolSize = pool.length;
		this._backprop.resetAccumulators();

		let totalLoss = 0;
		for (const exp of pool) {
			totalLoss += exp.loss;
			this._backprop.backpropAccumulate(
				this._poolManager.experienceToContext(exp),
				exp.target!
			);
		}

		this._backprop.applyAccumulatedGradients(poolSize);
		this._poolManager.clear();
		return totalLoss / poolSize;
	}
}
