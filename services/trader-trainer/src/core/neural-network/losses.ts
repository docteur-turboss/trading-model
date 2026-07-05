import type { LossConfig, LossFunctionType } from "./type";

const EPSILON = 1e-10;

/** Throws if output and target arrays differ in length. */
function validateLengths(output: Float32Array, target: Float32Array): void {
	if (output.length !== target.length) {
		throw new RangeError(
			`Loss function input/output length mismatch: output.length=${output.length}, target.length=${target.length}`
		);
	}
}

export interface LossDefinition {
	loss(
		output: Float32Array,
		target: Float32Array,
		config: Required<LossConfig>
	): number;

	gradient(
		output: Float32Array,
		target: Float32Array,
		config: Required<LossConfig>
	): Float32Array;
}

class MeanSquaredError implements LossDefinition {
	loss(
		output: Float32Array,
		target: Float32Array,
		_config: Required<LossConfig>
	): number {
		validateLengths(output, target);
		const len = output.length;

		let sum = 0;

		for (let i = 0; i < len; i++) {
			const err = target[i] - output[i];
			sum += err * err;
		}

		return sum / len;
	}

	gradient(
		output: Float32Array,
		target: Float32Array,
		_config: Required<LossConfig>
	): Float32Array {
		validateLengths(output, target);
		const len = output.length;
		const out = new Float32Array(len);

		const invN = 1 / len;

		for (let i = 0; i < len; i++) {
			const diff = output[i] - target[i];
			out[i] = 2 * diff * invN;
		}

		return out;
	}
}

class MeanAbsoluteError implements LossDefinition {
	loss(
		output: Float32Array,
		target: Float32Array,
		_config: Required<LossConfig>
	): number {
		validateLengths(output, target);
		const len = output.length;

		let sum = 0;

		for (let i = 0; i < len; i++) {
			const err = target[i] - output[i];
			sum += Math.abs(err);
		}

		return sum / len;
	}

	gradient(
		output: Float32Array,
		target: Float32Array,
		_config: Required<LossConfig>
	): Float32Array {
		validateLengths(output, target);
		const len = output.length;
		const out = new Float32Array(len);

		const invN = 1 / len;

		for (let i = 0; i < len; i++) {
			const diff = output[i] - target[i];

			out[i] = (diff > 0 ? 1 : diff < 0 ? -1 : 0) * invN;
		}

		return out;
	}
}

class RootMeanSquaredError implements LossDefinition {
	loss(
		output: Float32Array,
		target: Float32Array,
		_config: Required<LossConfig>
	): number {
		validateLengths(output, target);
		const len = output.length;

		let sum = 0;

		for (let i = 0; i < len; i++) {
			const err = target[i] - output[i];
			sum += err * err;
		}

		return Math.sqrt(sum / len);
	}

	gradient(
		output: Float32Array,
		target: Float32Array,
		_config: Required<LossConfig>
	): Float32Array {
		validateLengths(output, target);
		const len = output.length;
		const out = new Float32Array(len);

		const invN = 1 / len;

		let sum = 0;

		for (let i = 0; i < len; i++) {
			const diff = output[i] - target[i];
			sum += diff * diff;
		}

		const rmse = Math.sqrt(sum * invN) + EPSILON;

		const scale = invN / rmse;

		for (let i = 0; i < len; i++) {
			out[i] = (output[i] - target[i]) * scale;
		}

		return out;
	}
}

class MeanBiasError implements LossDefinition {
	loss(
		output: Float32Array,
		target: Float32Array,
		_config: Required<LossConfig>
	): number {
		validateLengths(output, target);
		const len = output.length;

		let sum = 0;

		for (let i = 0; i < len; i++) {
			sum += target[i] - output[i];
		}

		return sum / len;
	}

	gradient(
		output: Float32Array,
		target: Float32Array,
		_config: Required<LossConfig>
	): Float32Array {
		validateLengths(output, target);
		const len = output.length;
		const out = new Float32Array(len);

		const invN = 1 / len;

		for (let i = 0; i < len; i++) {
			out[i] = (output[i] - target[i]) * invN;
		}

		return out;
	}
}

class HuberLoss implements LossDefinition {
	loss(
		output: Float32Array,
		target: Float32Array,
		config: Required<LossConfig>
	): number {
		validateLengths(output, target);
		const len = output.length;

		let sum = 0;

		const delta = config.deltaHuber;

		for (let i = 0; i < len; i++) {
			const err = Math.abs(target[i] - output[i]);

			if (err <= delta) {
				sum += 0.5 * err * err;
			} else {
				sum += delta * (err - 0.5 * delta);
			}
		}

		return sum / len;
	}

	gradient(
		output: Float32Array,
		target: Float32Array,
		config: Required<LossConfig>
	): Float32Array {
		validateLengths(output, target);
		const len = output.length;
		const out = new Float32Array(len);

		const invN = 1 / len;
		const delta = config.deltaHuber;

		for (let i = 0; i < len; i++) {
			const diff = output[i] - target[i];

			out[i] = (diff > delta ? delta : diff < -delta ? -delta : diff) * invN;
		}

		return out;
	}
}

class LogCoshLoss implements LossDefinition {
	loss(
		output: Float32Array,
		target: Float32Array,
		_config: Required<LossConfig>
	): number {
		validateLengths(output, target);
		const len = output.length;

		let sum = 0;

		for (let i = 0; i < len; i++) {
			sum += Math.log(Math.cosh(target[i] - output[i]));
		}

		return sum / len;
	}

	gradient(
		output: Float32Array,
		target: Float32Array,
		_config: Required<LossConfig>
	): Float32Array {
		validateLengths(output, target);
		const len = output.length;
		const out = new Float32Array(len);

		const invN = 1 / len;

		for (let i = 0; i < len; i++) {
			out[i] = -Math.tanh(target[i] - output[i]) * invN;
		}

		return out;
	}
}

class CrossEntropyLoss implements LossDefinition {
	loss(
		output: Float32Array,
		target: Float32Array,
		_config: Required<LossConfig>
	): number {
		validateLengths(output, target);
		const len = output.length;

		let sum = 0;

		for (let i = 0; i < len; i++) {
			const outVal = Math.min(1 - EPSILON, Math.max(EPSILON, output[i]));

			sum -= target[i] * Math.log(outVal);
		}

		return sum / len;
	}

	gradient(
		output: Float32Array,
		target: Float32Array,
		_config: Required<LossConfig>
	): Float32Array {
		validateLengths(output, target);
		const len = output.length;
		const out = new Float32Array(len);

		const invN = 1 / len;

		for (let i = 0; i < len; i++) {
			out[i] = (-target[i] / (output[i] + EPSILON)) * invN;
		}

		return out;
	}
}

class BinaryCrossEntropyLoss implements LossDefinition {
	loss(
		output: Float32Array,
		target: Float32Array,
		_config: Required<LossConfig>
	): number {
		validateLengths(output, target);
		const len = output.length;

		let sum = 0;

		for (let i = 0; i < len; i++) {
			const outVal = output[i];
			const tgt = target[i];

			sum -=
				tgt * Math.log(outVal + EPSILON) +
				(1 - tgt) * Math.log(1 - outVal + EPSILON);
		}

		return sum / len;
	}

	gradient(
		output: Float32Array,
		target: Float32Array,
		_config: Required<LossConfig>
	): Float32Array {
		validateLengths(output, target);
		const len = output.length;
		const out = new Float32Array(len);

		const invN = 1 / len;

		for (let i = 0; i < len; i++) {
			const outVal = output[i];
			const tgt = target[i];

			out[i] =
				(-tgt / (outVal + EPSILON) + (1 - tgt) / (1 - outVal + EPSILON)) *
				invN;
		}

		return out;
	}
}

class HingeLoss implements LossDefinition {
	loss(
		output: Float32Array,
		target: Float32Array,
		_config: Required<LossConfig>
	): number {
		validateLengths(output, target);
		const len = output.length;

		let sum = 0;

		for (let i = 0; i < len; i++) {
			const margin = 1 - target[i] * output[i];

			sum += margin > 0 ? margin : 0;
		}

		return sum / len;
	}

	gradient(
		output: Float32Array,
		target: Float32Array,
		_config: Required<LossConfig>
	): Float32Array {
		validateLengths(output, target);
		const len = output.length;
		const out = new Float32Array(len);

		const invN = 1 / len;

		for (let i = 0; i < len; i++) {
			const outVal = output[i];
			const tgt = target[i];

			out[i] = (tgt * outVal < 1 ? -tgt : 0) * invN;
		}

		return out;
	}
}

class KLDivergenceLoss implements LossDefinition {
	loss(
		output: Float32Array,
		target: Float32Array,
		_config: Required<LossConfig>
	): number {
		validateLengths(output, target);
		const len = output.length;

		let sum = 0;

		for (let i = 0; i < len; i++) {
			const tgt = target[i];

			sum += tgt * Math.log((tgt + EPSILON) / (output[i] + EPSILON));
		}

		return sum / len;
	}

	gradient(
		output: Float32Array,
		target: Float32Array,
		_config: Required<LossConfig>
	): Float32Array {
		validateLengths(output, target);
		const len = output.length;
		const out = new Float32Array(len);

		const invN = 1 / len;

		for (let i = 0; i < len; i++) {
			out[i] = (-target[i] / (output[i] + EPSILON)) * invN;
		}

		return out;
	}
}

export const MEAN_SQUARED_ERROR = new MeanSquaredError();
export const MEAN_ABSOLUTE_ERROR = new MeanAbsoluteError();
export const ROOT_MEAN_SQUARED_ERROR = new RootMeanSquaredError();
export const MEAN_BIAS_ERROR = new MeanBiasError();
export const HUBER_LOSS = new HuberLoss();
export const LOG_COSH_LOSS = new LogCoshLoss();
export const CROSS_ENTROPY = new CrossEntropyLoss();
export const BINARY_CROSS_ENTROPY = new BinaryCrossEntropyLoss();
export const HINGE_LOSS = new HingeLoss();
export const KL_DIVERGENCE = new KLDivergenceLoss();

export const LOSSES: Record<LossFunctionType, LossDefinition> = {
	"mean-squared-error": MEAN_SQUARED_ERROR,
	"mean-absolute-error": MEAN_ABSOLUTE_ERROR,
	"root-mean-squared-error": ROOT_MEAN_SQUARED_ERROR,
	"mean-biais-error": MEAN_BIAS_ERROR,
	"huber-loss": HUBER_LOSS,
	"log-cosh-loss": LOG_COSH_LOSS,
	"cross-entropy": CROSS_ENTROPY,
	"binary-cross-entropy": BINARY_CROSS_ENTROPY,
	"hinge-loss": HINGE_LOSS,
	"Kullback-Leibler-divergence": KL_DIVERGENCE,
};
