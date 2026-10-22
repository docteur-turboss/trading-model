import { GradientApplier } from "./gradient-applier";
import { HiddenDeltaComputer } from "./hidden-delta-computer";
import type { NnTrainingDeps } from "./nn-training-deps";
import { OutputDeltaComputer } from "./output-delta-computer";
import type { ActivationType, ForwardContext } from "./type";

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
	applyImmediately: boolean;
}

export interface WeightGradientContext {
	weightBuf: Float32Array;
	rowOffset: number;
	deltaJ: number;
	input: Float32Array;
	fanIn: number;
}

export class BackpropEngine {
	private readonly _outputDeltaComputer: OutputDeltaComputer;
	private readonly _hiddenDeltaComputer: HiddenDeltaComputer;
	private readonly _gradientApplier: GradientApplier;

	constructor(private readonly _deps: NnTrainingDeps) {
		this._outputDeltaComputer = new OutputDeltaComputer(this._deps.config);
		this._hiddenDeltaComputer = new HiddenDeltaComputer(
			this._deps.layers,
			this._deps.config
		);
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

	private _applyGradients(
		context: ForwardContext,
		allDeltas: Float32Array[],
		applyImmediately: boolean
	): void {
		for (let layerIdx = 0; layerIdx < this._deps.layers.length; layerIdx++) {
			const layerInput =
				layerIdx === 0 ? context.input : context.layerOutputs[layerIdx - 1];
			this._gradientApplier.computeGradients({
				layerIndex: layerIdx,
				delta: allDeltas[layerIdx],
				layerInput,
				applyImmediately,
			});
		}
	}

	private _backpropImpl(
		context: ForwardContext,
		target: Float32Array,
		applyImmediately: boolean
	): void {
		const outputDelta = this._computeOutputDelta(context, target);
		const lastLayerIndex = this._deps.layers.length - 1;
		const hiddenDeltas = this._hiddenDeltaComputer.compute(
			lastLayerIndex,
			outputDelta,
			context
		);
		this._applyGradients(
			context,
			[...hiddenDeltas, outputDelta],
			applyImmediately
		);
	}

	backprop(context: ForwardContext, target: Float32Array): void {
		this._backpropImpl(context, target, true);
	}

	backpropAccumulate(context: ForwardContext, target: Float32Array): void {
		this._backpropImpl(context, target, false);
	}

	applyAccumulatedGradients(numSamples: number): void {
		this._gradientApplier.applyAccumulatedGradients(numSamples);
	}

	resetAccumulators(): void {
		this._gradientApplier.resetAccumulators();
	}

	computeLoss(output: Float32Array, target: Float32Array): number {
		return this._outputDeltaComputer.computeLoss(output, target);
	}
}
