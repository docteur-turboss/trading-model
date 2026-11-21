import { ACTIVATIONS } from "@trading-model/model-runtime/neural-network/activation";
import {
	type ActivationType,
	ConnectionType,
	type ForwardContext,
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
		const residual =
			config.connectionType === ConnectionType.ResidualConnection;
		const deltas: Float32Array[] = [];
		let nextDeltas = outputDelta;
		let aboveGrad: Float32Array | undefined;
		for (let layerIdx = lastLayerIndex - 1; layerIdx >= 0; layerIdx--) {
			const next = layers[layerIdx + 1];
			const { fn, derivative } = ACTIVATIONS[config.activationType[layerIdx]];
			const zs = context.layerZValues[layerIdx];
			// dL/dy: Wᵀ of the next deltas, plus the residual path mirroring the forward projection.
			const outGrad = new Float32Array(next.fanIn);
			for (let i = 0; i < outGrad.length; i++) {
				let sum = 0;
				for (let j = 0; j < next.fanOut; j++) {
					sum += nextDeltas[j] * next.weights[j * next.fanIn + i];
				}
				outGrad[i] = sum;
			}
			if (aboveGrad) {
				const count = Math.min(outGrad.length, aboveGrad.length);
				for (let i = 0; i < count; i++) {
					outGrad[i] += aboveGrad[i];
				}
			}
			// f' from f(z), never from the output after the skip term.
			const delta = new Float32Array(outGrad.length);
			for (let i = 0; i < delta.length; i++) {
				delta[i] = outGrad[i] * derivative(fn(zs[i]), zs[i]);
			}
			nextDeltas = clipGradients(delta, config.gradientClipNorm);
			deltas.unshift(nextDeltas);
			aboveGrad = residual ? outGrad : undefined;
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
