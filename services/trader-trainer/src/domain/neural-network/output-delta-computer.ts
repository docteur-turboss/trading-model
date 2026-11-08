import { ACTIVATIONS } from "./activation";
import type { OutputDeltasContext } from "./backprop-engine";
import { LOSSES } from "./losses";
import type { NeuralNetworkConfig } from "./type";
import { clipGradients } from "./utils";

export class OutputDeltaComputer {
	constructor(private readonly _config: Required<NeuralNetworkConfig>) {}

	compute(ctx: OutputDeltasContext): Float32Array {
		const { outputZ, output, target, activation } = ctx;
		const lossGrad = LOSSES[this._config.lossFunctionType].gradient(
			output,
			target,
			this._config
		);
		const delta = new Float32Array(output.length);
		for (let j = 0; j < output.length; j++) {
			delta[j] =
				lossGrad[j] * ACTIVATIONS[activation].derivative(output[j], outputZ[j]);
		}
		return clipGradients(delta, this._config.gradientClipNorm);
	}

	computeLoss(output: Float32Array, target: Float32Array): number {
		return LOSSES[this._config.lossFunctionType].loss(
			output,
			target,
			this._config
		);
	}
}
