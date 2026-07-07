import type {
	LayerGradientContext,
	OutputDeltasContext,
	WeightGradientContext,
} from "./backprop-engine";
import { GradientApplier } from "./gradient-applier";
import { HiddenDeltaComputer } from "./hidden-delta-computer";
import type { NnTrainingDeps } from "./nn-training-deps";
import { OutputDeltaComputer } from "./output-delta-computer";
import type { ForwardContext, LayerMemory } from "./type";

export type {
	LayerGradientContext,
	OutputDeltasContext,
	WeightGradientContext,
};

export class GradientComputer {
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

	computeOutputDeltas(ctx: OutputDeltasContext): Float32Array {
		return this._outputDeltaComputer.compute(ctx);
	}

	computeHiddenDeltas(
		nextLayerIndex: number,
		nextDeltas: Float32Array,
		context: ForwardContext
	): Float32Array[] {
		return this._hiddenDeltaComputer.compute(
			nextLayerIndex,
			nextDeltas,
			context
		);
	}

	computeLayerGradients(ctx: LayerGradientContext): void {
		this._gradientApplier.computeGradients(ctx);
	}

	computeWeightGradient(ctx: WeightGradientContext): void {
		const { weightBuf, rowOffset, deltaJ, input, fanIn } = ctx;
		for (let idxK = 0; idxK < fanIn; idxK++) {
			weightBuf[rowOffset + idxK] += deltaJ * input[idxK];
		}
	}

	applyGradientsToLayer(
		layer: LayerMemory,
		delta: Float32Array,
		layerInput: Float32Array
	): void {
		const layerIndex = this._deps.layers.indexOf(layer);
		this._gradientApplier.computeGradients({
			layerIndex,
			delta,
			layerInput,
			applyImmediately: true,
		});
	}

	accumulateGradients(
		layer: LayerMemory,
		delta: Float32Array,
		layerInput: Float32Array
	): void {
		const layerIndex = this._deps.layers.indexOf(layer);
		this._gradientApplier.computeGradients({
			layerIndex,
			delta,
			layerInput,
			applyImmediately: false,
		});
	}

	averageAndApplyGradients(_layer: LayerMemory, numSamples: number): void {
		this._gradientApplier.applyAccumulatedGradients(numSamples);
	}

	computeLoss(output: Float32Array, target: Float32Array): number {
		return this._outputDeltaComputer.computeLoss(output, target);
	}

	resetAccumulators(): void {
		this._gradientApplier.resetAccumulators();
	}
}
