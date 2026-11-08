import { agentError } from "../../shared/errors";
import { BackpropEngine } from "./backprop-engine";
import { FeedForwardEngine } from "./feed-forward-engine";
import {
	distributeAroundWeights as distributeAroundWeightsFn,
	getWeights as getWeightsFn,
	parameterCount as parameterCountFn,
	setWeights as setWeightsFn,
} from "./network-serialization";
import { NeuralNetworkBuilder } from "./neural-network-builder";
import type { ForwardContext, LayerMemory, NeuralNetworkConfig } from "./type";

function _validateSize(kind: string, actual: number, expected: number): void {
	if (actual !== expected) {
		throw agentError(`Expected ${kind} size ${expected}, got ${actual}`);
	}
}

export class NeuralNetwork {
	private readonly _layers: LayerMemory[];
	private readonly _feedForward: FeedForwardEngine;
	private readonly _backprop: BackpropEngine;
	private readonly _config: Required<NeuralNetworkConfig>;

	constructor(cfg: NeuralNetworkConfig) {
		const { config, layers, optimizerHp } = NeuralNetworkBuilder.build(cfg);
		this._config = config;
		this._layers = layers;
		this._feedForward = new FeedForwardEngine(config, layers);
		this._backprop = new BackpropEngine({ config, layers, optimizerHp });
	}

	public forward(input: Float32Array): ForwardContext {
		return this._feedForward.forward(input);
	}

	/** One gradient step on (inputs, targets); returns the loss before the step. */
	public train(inputs: Float32Array, targets: Float32Array): number {
		const sizes = this._config.neuronsByLayer;
		_validateSize("input", inputs.length, sizes[0]);
		_validateSize("target", targets.length, sizes[sizes.length - 1]);
		return this.trainFrom(this._feedForward.forward(inputs), targets);
	}

	/** `train` on a forward pass already made with the current weights. */
	public trainFrom(context: ForwardContext, targets: Float32Array): number {
		const sizes = this._config.neuronsByLayer;
		_validateSize("target", targets.length, sizes[sizes.length - 1]);
		this._backprop.backprop(context, targets);
		return this._backprop.computeLoss(context.output, targets);
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
