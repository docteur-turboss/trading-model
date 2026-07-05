import { ACTIVATIONS } from "./activation";
import { LOSSES } from "./losses";
import { OPTIMIZERS, type OptimizerHyperparams } from "./optimizer";
import type {
	ActivationType,
	ForwardContext,
	LayerMemory,
	NeuralNetworkConfig,
} from "./type";

export class BackpropEngine {
	constructor(
		private readonly _config: Required<NeuralNetworkConfig>,
		private readonly _layers: LayerMemory[],
		private readonly _optimizerHp: OptimizerHyperparams
	) {}

	backprop(context: ForwardContext, target: Float32Array): void {
		const lastLayerIndex = this._layers.length - 1;
		const outputActivation = this._config.activationType[lastLayerIndex];
		const outputZ = context.layerZValues[lastLayerIndex];
		const output = context.layerOutputs[lastLayerIndex];

		const outputDelta = this._computeOutputDeltas(
			outputZ,
			output,
			target,
			outputActivation
		);

		const hiddenDeltas = this._computeHiddenDeltas(
			lastLayerIndex,
			outputDelta,
			context
		);
		const allDeltas = [...hiddenDeltas, outputDelta];

		for (let layerIdx = 0; layerIdx < this._layers.length; layerIdx++) {
			const layerInput =
				layerIdx === 0 ? context.input : context.layerOutputs[layerIdx - 1];
			this._computeLayerGradients(layerIdx, allDeltas[layerIdx], layerInput, true);
		}
	}

	backpropAccumulate(context: ForwardContext, target: Float32Array): void {
		const lastLayerIndex = this._layers.length - 1;
		const outputActivation = this._config.activationType[lastLayerIndex];
		const outputZ = context.layerZValues[lastLayerIndex];
		const output = context.layerOutputs[lastLayerIndex];

		const outputDelta = this._computeOutputDeltas(
			outputZ,
			output,
			target,
			outputActivation
		);

		const hiddenDeltas = this._computeHiddenDeltas(
			lastLayerIndex,
			outputDelta,
			context
		);
		const allDeltas = [...hiddenDeltas, outputDelta];

		for (let layerIdx = 0; layerIdx < this._layers.length; layerIdx++) {
			const layerInput =
				layerIdx === 0 ? context.input : context.layerOutputs[layerIdx - 1];
			this._computeLayerGradients(
				layerIdx,
				allDeltas[layerIdx],
				layerInput,
				false
			);
		}
	}

	applyAccumulatedGradients(numSamples: number): void {
		if (numSamples === 0) {
			return;
		}

		for (let layerIdx = 0; layerIdx < this._layers.length; layerIdx++) {
			this._averageAndApplyGradients(this._layers[layerIdx], numSamples);
		}
	}

	resetAccumulators(): void {
		for (let layerIdx = 0; layerIdx < this._layers.length; layerIdx++) {
			this._layers[layerIdx].accumGradW.fill(0);
			this._layers[layerIdx].accumGradB.fill(0);
		}
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

	private _computeOutputDeltas(
		outputZ: Float32Array,
		output: Float32Array,
		target: Float32Array,
		activation: ActivationType
	): Float32Array {
		const delta = new Float32Array(output.length);
		const lossGrad = this._computeLossGradient(output, target);

		for (let j = 0; j < output.length; j++) {
			if (activation === "softmax") {
				delta[j] = output[j] - target[j];
			} else {
				const actGrad = this._activationDerivative(
					output[j],
					outputZ[j],
					activation
				);
				delta[j] = lossGrad[j] * actGrad;
			}
		}

		return this._clipGradients(delta);
	}

	private _computeHiddenDeltas(
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

	private _computeLayerGradients(
		layerIndex: number,
		delta: Float32Array,
		layerInput: Float32Array,
		applyImmediately: boolean
	): void {
		const layer = this._layers[layerIndex];

		if (applyImmediately) {
			this._applyGradientsToLayer(layer, delta, layerInput);
		} else {
			this._accumulateGradients(layer, delta, layerInput);
		}
	}

	private _computeWeightGradient(
		weightBuf: Float32Array,
		rowOffset: number,
		deltaJ: number,
		input: Float32Array,
		fanIn: number
	): void {
		for (let idxK = 0; idxK < fanIn; idxK++) {
			weightBuf[rowOffset + idxK] += deltaJ * input[idxK];
		}
	}

	private _applyGradientsToLayer(
		layer: LayerMemory,
		delta: Float32Array,
		layerInput: Float32Array
	): void {
		const { fanIn, fanOut, gradW, gradB } = layer;

		for (let j = 0; j < fanOut; j++) {
			const rowOffset = j * fanIn;
			const deltaJ = delta[j];
			gradB[j] = deltaJ;
			this._computeWeightGradient(gradW, rowOffset, deltaJ, layerInput, fanIn);
		}

		const opt = OPTIMIZERS[this._config.optimizerType];
		const { weights, bias, wState, bState } = layer;

		opt.step(
			weights,
			gradW,
			wState,
			this._config.learningRate,
			this._optimizerHp
		);

		if (this._config.useBias) {
			opt.step(
				bias,
				gradB,
				bState,
				this._config.learningRate,
				this._optimizerHp
			);
		}
	}

	private _accumulateGradients(
		layer: LayerMemory,
		delta: Float32Array,
		layerInput: Float32Array
	): void {
		const { fanIn, fanOut, accumGradW, accumGradB } = layer;

		for (let j = 0; j < fanOut; j++) {
			const rowOffset = j * fanIn;
			const deltaJ = delta[j];
			accumGradB[j] += deltaJ;
			this._computeWeightGradient(
				accumGradW,
				rowOffset,
				deltaJ,
				layerInput,
				fanIn
			);
		}
	}

	private _averageAndApplyGradients(
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

		opt.step(
			weights,
			gradW,
			wState,
			this._config.learningRate,
			this._optimizerHp
		);

		if (this._config.useBias) {
			opt.step(
				bias,
				gradB,
				bState,
				this._config.learningRate,
				this._optimizerHp
			);
		}

		accumGradW.fill(0);
		accumGradB.fill(0);
	}
}
