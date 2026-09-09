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

import type { NumericRange } from "@trading-model/common/domain/numeric-range";

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
	bounds: NumericRange
): void {
	if (
		typeof value !== "number" ||
		!Number.isFinite(value) ||
		value < bounds.lo ||
		value > bounds.hi
	) {
		err(ctx, `must be a finite number in [${bounds.lo}, ${bounds.hi}]`, value);
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
