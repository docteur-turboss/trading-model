import { agentError } from "@trading-model/model-runtime/errors";
import { FeedForwardEngine } from "@trading-model/model-runtime/neural-network/feed-forward-engine";
import {
	getWeights as getWeightsFn,
	parameterCount as parameterCountFn,
	setWeights as setWeightsFn,
} from "@trading-model/model-runtime/neural-network/network-serialization";
import type {
	ForwardContext,
	LayerMemory,
	NeuralNetworkConfig,
} from "@trading-model/model-runtime/neural-network/type";
import { BackpropEngine } from "./backprop-engine";
import { NeuralNetworkBuilder } from "./neural-network-builder";

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
		const { config, layers } = NeuralNetworkBuilder.build(cfg);
		this._config = config;
		this._layers = layers;
		this._feedForward = new FeedForwardEngine(config, layers);
		this._backprop = new BackpropEngine({ config, layers });
	}

	public forward(input: Float32Array): ForwardContext {
		return this._feedForward.forward(input);
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

	public parameterCount(): number {
		return parameterCountFn(this._layers);
	}
}
