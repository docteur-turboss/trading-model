import {
	ActivationType,
	ConnectionType,
	InitialisationType,
	NormalisationType,
} from "../../neural-network/type";
import type { ValidationContext } from "../genome";

export const VALID_ACTIVATIONS = new Set([
	ActivationType.Relu,
	ActivationType.Sigmoid,
	ActivationType.Tanh,
	ActivationType.LeakyReLu,
	ActivationType.Elu,
	ActivationType.Mish,
	ActivationType.Gelu,
	ActivationType.Softmax,
]);
export const VALID_CONNECTION_TYPES = new Set([
	ConnectionType.DenseSkip,
	ConnectionType.FullyConnected,
	ConnectionType.ResidualConnection,
]);
export const VALID_BIAS_TYPES = new Set([
	InitialisationType.Zeros,
	InitialisationType.Random,
	InitialisationType.Xavier,
	InitialisationType.He,
	InitialisationType.LeCun,
]);

import type { Bounded } from "../bounded";

export const VALID_NORM_TYPES = new Set([
	NormalisationType.None,
	NormalisationType.LogarithmicNormalization,
	NormalisationType.DecimalScaling,
	NormalisationType.Border,
	NormalisationType.MinMax,
	NormalisationType.RobustScaling,
	NormalisationType.ZScore,
]);

export function err(
	ctx: ValidationContext,
	message: string,
	actual: unknown
): void {
	const { errors, path } = ctx;
	errors.push({ path, message, actual });
}

export function checkRange(
	ctx: ValidationContext,
	value: unknown,
	bounds: Bounded
): void {
	const { min, max } = bounds;
	if (
		typeof value !== "number" ||
		!Number.isFinite(value) ||
		value < min ||
		value > max
	) {
		err(ctx, `must be a finite number in [${min}, ${max}]`, value);
	}
}

export function checkPositiveInt(
	ctx: ValidationContext,
	value: unknown,
	options: { min?: number } = {}
): void {
	const min = options.min ?? 1;
	if (!Number.isInteger(value) || (value as number) < min) {
		err(ctx, `must be an integer ≥ ${min}`, value);
	}
}
