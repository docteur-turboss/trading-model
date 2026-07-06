import { ACTIVATIONS } from "./activation";
import { LOSSES } from "./losses";
import { OPTIMIZERS, type OptimizerHyperparams } from "./optimizer";
import type {
	ActivationType,
	ForwardContext,
	LayerMemory,
	NeuralNetworkConfig,
} from "./type";

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

export class GradientComputer {
	constructor(
		private readonly _config: Required<NeuralNetworkConfig>,
		private readonly _layers: LayerMemory[],
		private readonly _optimizerHp: OptimizerHyperparams
	) {}

	private _computeOutputDeltaElement(
		output: Float32Array,
		outputZ: Float32Array,
		target: Float32Array,
		activation: ActivationType,
		j: number,
		lossGrad: Float32Array
	): number {
		if (activation === "softmax") {
			return output[j] - target[j];
		}
		return lossGrad[j] * this._activationDerivative(output[j], outputZ[j], activation);
	}

	computeOutputDeltas(ctx: OutputDeltasContext): Float32Array {
		const { outputZ, output, target, activation } = ctx;
		const delta = new Float32Array(output.length);
		const lossGrad = this._computeLossGradient(output, target);

		for (let j = 0; j < output.length; j++) {
			delta[j] = this._computeOutputDeltaElement(output, outputZ, target, activation, j, lossGrad);
		}

		return this._clipGradients(delta);
	}

	computeHiddenDeltas(
		nextLayerIndex: number,
		nextDeltas: Float32Array,
		context: ForwardContext
	): Float32Array[] {
		const deltas: Float32Array[] = [];

		for (let layerIdx = nextLayerIndex - 1; layerIdx >= 0; layerIdx--) {
			const current = this._layers[layerIdx];
			const next = this._layers[layerIdx + 1];

			const delta = new Float32Array(current.fanOut);
			const currentActivation = this._config.activationType[layerIdx];
			const currentOutput = context.layerOutputs[layerIdx];
			const currentZ = context.layerZValues[layerIdx];

			for (let i = 0; i < current.fanOut; i++) {
				let sum = 0;

				for (let j = 0; j < next.fanOut; j++) {
					const weight = next.weights[j * next.fanIn + i];
					sum += nextDeltas[j] * weight;
				}

				const grad = this._activationDerivative(
					currentOutput[i],
					currentZ[i],
					currentActivation
				);
				delta[i] = sum * grad;
			}

			deltas.unshift(this._clipGradients(delta));
			nextDeltas = delta;
		}

		return deltas;
	}

	computeLayerGradients(ctx: LayerGradientContext): void {
		const { layerIndex, delta, layerInput, applyImmediately } = ctx;
		const layer = this._layers[layerIndex];

		if (applyImmediately) {
			this.applyGradientsToLayer(layer, delta, layerInput);
		} else {
			this.accumulateGradients(layer, delta, layerInput);
		}
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
		const { fanIn, fanOut, gradW, gradB } = layer;

		for (let j = 0; j < fanOut; j++) {
			const rowOffset = j * fanIn;
			const deltaJ = delta[j];
			gradB[j] = deltaJ;
			this.computeWeightGradient({ weightBuf: gradW, rowOffset, deltaJ, input: layerInput, fanIn });
		}

		const opt = OPTIMIZERS[this._config.optimizerType];
		const { weights, bias, wState, bState } = layer;

		opt.step({
			params: weights,
			grads: gradW,
			state: wState,
			lr: this._config.learningRate,
			hp: this._optimizerHp,
		});

		if (this._config.useBias) {
			opt.step({
				params: bias,
				grads: gradB,
				state: bState,
				lr: this._config.learningRate,
				hp: this._optimizerHp,
			});
		}
	}

	accumulateGradients(
		layer: LayerMemory,
		delta: Float32Array,
		layerInput: Float32Array
	): void {
		const { fanIn, fanOut, accumGradW, accumGradB } = layer;

		for (let j = 0; j < fanOut; j++) {
			const rowOffset = j * fanIn;
			const deltaJ = delta[j];
			accumGradB[j] += deltaJ;
			this.computeWeightGradient({ weightBuf: accumGradW, rowOffset, deltaJ, input: layerInput, fanIn });
		}
	}

	averageAndApplyGradients(
		layer: LayerMemory,
		numSamples: number
	): void {
		const {
			weights,
			bias,
			accumGradW,
			accumGradB,
			gradW,
			gradB,
			wState,
			bState,
		} = layer;
		const opt = OPTIMIZERS[this._config.optimizerType];

		const scale = 1 / numSamples;
		for (let i = 0; i < accumGradW.length; i++) {
			gradW[i] = accumGradW[i] * scale;
		}
		for (let i = 0; i < accumGradB.length; i++) {
			gradB[i] = accumGradB[i] * scale;
		}

		opt.step({
			params: weights,
			grads: gradW,
			state: wState,
			lr: this._config.learningRate,
			hp: this._optimizerHp,
		});

		if (this._config.useBias) {
			opt.step({
				params: bias,
				grads: gradB,
				state: bState,
				lr: this._config.learningRate,
				hp: this._optimizerHp,
			});
		}

		accumGradW.fill(0);
		accumGradB.fill(0);
	}

	computeLoss(output: Float32Array, target: Float32Array): number {
		return LOSSES[this._config.lossFunctionType].loss(
			output,
			target,
			this._config
		);
	}

	resetAccumulators(): void {
		for (let layerIdx = 0; layerIdx < this._layers.length; layerIdx++) {
			this._layers[layerIdx].accumGradW.fill(0);
			this._layers[layerIdx].accumGradB.fill(0);
		}
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
