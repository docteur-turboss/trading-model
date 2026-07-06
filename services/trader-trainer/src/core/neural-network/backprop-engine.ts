import type { ActivationType, ForwardContext, LayerMemory, NeuralNetworkConfig } from "./type";
import type { OptimizerHyperparams } from "./optimizer";
import { GradientApplier } from "./gradient-applier";
import { HiddenDeltaComputer } from "./hidden-delta-computer";
import { OutputDeltaComputer } from "./output-delta-computer";

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

	constructor(
		private readonly _config: Required<NeuralNetworkConfig>,
		private readonly _layers: LayerMemory[],
		private readonly _optimizerHp: OptimizerHyperparams
	) {
		this._outputDeltaComputer = new OutputDeltaComputer(this._config);
		this._hiddenDeltaComputer = new HiddenDeltaComputer(
			this._layers,
			this._config
		);
		this._gradientApplier = new GradientApplier(
			this._layers,
			this._config,
			this._optimizerHp
		);
	}

	backprop(context: ForwardContext, target: Float32Array): void {
		const lastLayerIndex = this._layers.length - 1;
		const outputActivation = this._config.activationType[lastLayerIndex];
		const outputZ = context.layerZValues[lastLayerIndex];
		const output = context.layerOutputs[lastLayerIndex];

		const outputDelta = this._outputDeltaComputer.compute({
			outputZ,
			output,
			target,
			activation: outputActivation,
		});

		const hiddenDeltas = this._hiddenDeltaComputer.compute(
			lastLayerIndex,
			outputDelta,
			context
		);
		const allDeltas = [...hiddenDeltas, outputDelta];

		for (let layerIdx = 0; layerIdx < this._layers.length; layerIdx++) {
			const layerInput =
				layerIdx === 0 ? context.input : context.layerOutputs[layerIdx - 1];
			this._gradientApplier.computeGradients({
				layerIndex: layerIdx,
				delta: allDeltas[layerIdx],
				layerInput,
				applyImmediately: true,
			});
		}
	}

	backpropAccumulate(context: ForwardContext, target: Float32Array): void {
		const lastLayerIndex = this._layers.length - 1;
		const outputActivation = this._config.activationType[lastLayerIndex];
		const outputZ = context.layerZValues[lastLayerIndex];
		const output = context.layerOutputs[lastLayerIndex];

		const outputDelta = this._outputDeltaComputer.compute({
			outputZ,
			output,
			target,
			activation: outputActivation,
		});

		const hiddenDeltas = this._hiddenDeltaComputer.compute(
			lastLayerIndex,
			outputDelta,
			context
		);
		const allDeltas = [...hiddenDeltas, outputDelta];

		for (let layerIdx = 0; layerIdx < this._layers.length; layerIdx++) {
			const layerInput =
				layerIdx === 0 ? context.input : context.layerOutputs[layerIdx - 1];
			this._gradientApplier.computeGradients({
				layerIndex: layerIdx,
				delta: allDeltas[layerIdx],
				layerInput,
				applyImmediately: false,
			});
		}
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
