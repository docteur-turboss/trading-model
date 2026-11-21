import { ACTIVATIONS } from "@trading-model/model-runtime/neural-network/activation";
import type {
	ActivationType,
	ForwardContext,
} from "@trading-model/model-runtime/neural-network/type";
import { GradientApplier } from "./gradient-applier";
import type { NnTrainingDeps } from "./nn-training-deps";
import { OutputDeltaComputer } from "./output-delta-computer";
import { clipGradients } from "./utils";

export interface OutputDeltasContext {
	outputZ: Float32Array;
	output: Float32Array;
	target: Float32Array;
	activation: ActivationType;
}

export interface LayerGradientContext {
	layerIndex: number;
	delta: Float32Array;
	layerInput: Float32Array;
}

export class BackpropEngine {
	private readonly _outputDeltaComputer: OutputDeltaComputer;
	private readonly _gradientApplier: GradientApplier;

	constructor(private readonly _deps: NnTrainingDeps) {
		this._outputDeltaComputer = new OutputDeltaComputer(this._deps.config);
		this._gradientApplier = new GradientApplier(this._deps);
	}

	private _computeOutputDelta(
		context: ForwardContext,
		target: Float32Array
	): Float32Array {
		const lastLayerIndex = this._deps.layers.length - 1;
		return this._outputDeltaComputer.compute({
			outputZ: context.layerZValues[lastLayerIndex],
			output: context.layerOutputs[lastLayerIndex],
			target,
			activation: this._deps.config.activationType[lastLayerIndex],
		});
	}

	/** Deltas of layers 0..lastLayerIndex-1, back from the output delta. */
	private _hiddenDeltas(
		lastLayerIndex: number,
		outputDelta: Float32Array,
		context: ForwardContext
	): Float32Array[] {
		const { layers, config } = this._deps;
		const deltas: Float32Array[] = [];
		let nextDeltas = outputDelta;
		for (let layerIdx = lastLayerIndex - 1; layerIdx >= 0; layerIdx--) {
			const next = layers[layerIdx + 1];
			const { derivative } = ACTIVATIONS[config.activationType[layerIdx]];
			const output = context.layerOutputs[layerIdx];
			const z = context.layerZValues[layerIdx];
			const delta = new Float32Array(layers[layerIdx].fanOut);
			for (let i = 0; i < delta.length; i++) {
				let sum = 0;
				for (let j = 0; j < next.fanOut; j++) {
					sum += nextDeltas[j] * next.weights[j * next.fanIn + i];
				}
				delta[i] = sum * derivative(output[i], z[i]);
			}
			nextDeltas = clipGradients(delta, config.gradientClipNorm);
			deltas.unshift(nextDeltas);
		}
		return deltas;
	}

	private _applyGradients(
		context: ForwardContext,
		allDeltas: Float32Array[]
	): void {
		for (let layerIdx = 0; layerIdx < this._deps.layers.length; layerIdx++) {
			const layerInput =
				layerIdx === 0 ? context.input : context.layerOutputs[layerIdx - 1];
			this._gradientApplier.computeGradients({
				layerIndex: layerIdx,
				delta: allDeltas[layerIdx],
				layerInput,
			});
		}
	}

	backprop(context: ForwardContext, target: Float32Array): void {
		const outputDelta = this._computeOutputDelta(context, target);
		const lastLayerIndex = this._deps.layers.length - 1;
		const hiddenDeltas = this._hiddenDeltas(
			lastLayerIndex,
			outputDelta,
			context
		);
		this._applyGradients(context, [...hiddenDeltas, outputDelta]);
	}

	computeLoss(output: Float32Array, target: Float32Array): number {
		return this._outputDeltaComputer.computeLoss(output, target);
	}
}
