import { ACTIVATIONS } from "./activation";
import type { OutputDeltasContext } from "./backprop-engine";
import { LOSSES } from "./losses";
import type { NeuralNetworkConfig } from "./type";
import { ActivationType } from "./type";

export class OutputDeltaComputer {
	constructor(private readonly _config: Required<NeuralNetworkConfig>) {}

	private _computeOutputDeltaForNeuron(
		idx: number,
		output: Float32Array,
		target: Float32Array,
		outputZ: Float32Array,
		lossGrad: Float32Array,
		activation: ActivationType
	): number {
		if (activation === ActivationType.Softmax) {
			return output[idx] - target[idx];
		}
		return lossGrad[idx] * this._activationDerivative(output[idx], outputZ[idx], activation);
	}

	private _computeOutputDeltas(
		output: Float32Array,
		target: Float32Array,
		outputZ: Float32Array,
		lossGrad: Float32Array,
		activation: ActivationType
	): Float32Array {
		const delta = new Float32Array(output.length);
		for (let j = 0; j < output.length; j++) {
			delta[j] = this._computeOutputDeltaForNeuron(j, output, target, outputZ, lossGrad, activation);
		}
		return delta;
	}

	compute(ctx: OutputDeltasContext): Float32Array {
		const { outputZ, output, target, activation } = ctx;
		const lossGrad = this._computeLossGradient(output, target);
		const delta = this._computeOutputDeltas(output, target, outputZ, lossGrad, activation);
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
		if (maxNorm <= 0) {
			return delta;
		}
		const data = delta;

		let sum = 0;
		for (const _value of data) {
			sum += _value * _value;
		}
		const norm = Math.sqrt(sum);

		if (norm > maxNorm) {
			const scale = maxNorm / norm;
			for (let i = 0; i < data.length; i++) {
				data[i] *= scale;
			}
			return data;
		}

		return data;
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
