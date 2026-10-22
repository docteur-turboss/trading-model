import { ACTIVATIONS } from "./activation";
import type { OutputDeltasContext } from "./backprop-engine";
import { LOSSES } from "./losses";
import type { NeuralNetworkConfig } from "./type";
import { ActivationType } from "./type";
import { clipGradients } from "./utils";

interface OutputDeltaNeuronContext {
	output: Float32Array;
	target: Float32Array;
	outputZ: Float32Array;
	lossGrad: Float32Array;
	activation: ActivationType;
}

export class OutputDeltaComputer {
	constructor(private readonly _config: Required<NeuralNetworkConfig>) {}

	private _computeOutputDeltaForNeuron(
		idx: number,
		ctx: OutputDeltaNeuronContext
	): number {
		if (ctx.activation === ActivationType.Softmax) {
			return ctx.output[idx] - ctx.target[idx];
		}
		return (
			ctx.lossGrad[idx] *
			this._activationDerivative(
				ctx.output[idx],
				ctx.outputZ[idx],
				ctx.activation
			)
		);
	}

	private _computeOutputDeltas(ctx: OutputDeltaNeuronContext): Float32Array {
		const delta = new Float32Array(ctx.output.length);
		for (let j = 0; j < ctx.output.length; j++) {
			delta[j] = this._computeOutputDeltaForNeuron(j, ctx);
		}
		return delta;
	}

	compute(ctx: OutputDeltasContext): Float32Array {
		const { outputZ, output, target, activation } = ctx;
		const lossGrad = this._computeLossGradient(output, target);
		const delta = this._computeOutputDeltas({
			outputZ,
			output,
			target,
			lossGrad,
			activation,
		});
		return this._clipGradients(delta);
	}

	computeLoss(output: Float32Array, target: Float32Array): number {
		return LOSSES[this._config.lossFunctionType].loss(
			output,
			target,
			this._config
		);
	}

	private _computeLossGradient(
		output: Float32Array,
		target: Float32Array
	): Float32Array {
		return LOSSES[this._config.lossFunctionType].gradient(
			output,
			target,
			this._config
		);
	}

	private _clipGradients(
		delta: Float32Array,
		maxNorm: number = this._config.gradientClipNorm
	): Float32Array {
		return clipGradients(delta, maxNorm);
	}

	private _activationDerivative(
		postActivation: number,
		preActivation: number,
		activationType: ActivationType
	): number {
		return ACTIVATIONS[activationType].derivative(
			postActivation,
			preActivation
		);
	}
}
