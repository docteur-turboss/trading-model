import { BackpropEngine } from "../../core/neural-network/backprop-engine";
import { FeedForwardEngine } from "../../core/neural-network/feed-forward-engine";
import {
	distributeAroundWeights as distributeAroundWeightsFn,
	getWeights as getWeightsFn,
	parameterCount as parameterCountFn,
	setWeights as setWeightsFn,
} from "../../core/neural-network/network-serialization";
import { NeuralNetworkBuilder } from "../../core/neural-network/neural-network-builder";
import { LearningPool } from "../../core/neural-network/pool-manager";
import { PooledTrainer } from "../../core/neural-network/pooled-trainer";
import type {
	ForwardContext,
	LayerMemory,
	NeuralNetworkConfig,
} from "../../core/neural-network/type";

export class NeuralNetwork {
	private readonly _layers: LayerMemory[];
	private readonly _feedForward: FeedForwardEngine;
	private readonly _backprop: BackpropEngine;
	private readonly _trainer: PooledTrainer;
	private readonly _poolManager: LearningPool = new LearningPool();

	constructor(cfg: NeuralNetworkConfig) {
		const { config, layers, optimizerHp } = NeuralNetworkBuilder.build(cfg);
		this._layers = layers;
		this._feedForward = new FeedForwardEngine(config, layers);
		this._backprop = new BackpropEngine({ config, layers, optimizerHp });
		this._trainer = new PooledTrainer(
			this._feedForward,
			this._backprop,
			this._poolManager,
			config
		);
	}

	public forward(input: Float32Array): ForwardContext {
		return this._feedForward.forward(input);
	}

	public predict(input: Float32Array): Float32Array {
		return this._feedForward.predict(input);
	}

	public train(inputs: Float32Array, targets: Float32Array): number {
		return this._trainer.train(inputs, targets);
	}

	public forwardAndPool(input: Float32Array, target: Float32Array): number {
		return this._trainer.forwardAndPool(input, target);
	}

	public trainPooled(): number {
		return this._trainer.trainPooled();
	}

	public getPoolSize(): number {
		return this._poolManager.getSize();
	}

	public clearPool(): void {
		this._poolManager.clear();
	}

	public getWeights(): Float32Array {
		return getWeightsFn(this._layers);
	}

	public setWeights(buffer: Float32Array): void {
		setWeightsFn(this._layers, buffer);
	}

	public distributeAroundWeights(
		reference: NeuralNetwork | number,
		sigma = 0.1
	): void {
		const ref =
			typeof reference === "number" ? reference : reference.getWeights();
		distributeAroundWeightsFn(this._layers, ref, sigma);
	}

	public parameterCount(): number {
		return parameterCountFn(this._layers);
	}
}
