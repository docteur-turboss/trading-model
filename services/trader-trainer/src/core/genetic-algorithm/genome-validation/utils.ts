import type { ActivationType, ConnectionType, InitialisationType, NormalisationType } from "../../neural-network/type";
import type { ValidationContext } from "../genome";

export const VALID_ACTIVATIONS = new Set<ActivationType>([
	"relu", "sigmoid", "tanh", "leakyReLu", "elu", "mish", "gelu", "softmax",
]);
export const VALID_CONNECTION_TYPES = new Set<ConnectionType>([
	"dense-skip", "fully-connected", "residual-connection",
]);
export const VALID_BIAS_TYPES = new Set<InitialisationType>([
	"zeros", "random", "xavier", "he", "leCun",
]);
export const VALID_NORM_TYPES = new Set<NormalisationType>([
	"none", "logarithmic-normalization", "decimal-scaling", "border",
	"min-max", "robust-scaling", "z-score",
]);

export function err(ctx: ValidationContext, message: string, actual: unknown): void {
	const { errors, path } = ctx;
	errors.push({ path, message, actual });
}

export function checkRange(
	ctx: ValidationContext,
	value: unknown,
	lo: number,
	hi: number
): void {
	const { errors, path } = ctx;
	if (
		typeof value !== "number" ||
		!Number.isFinite(value) ||
		value < lo ||
		value > hi
	) {
		err(ctx, `must be a finite number in [${lo}, ${hi}]`, value);
	}
}

export function checkPositiveInt(
	ctx: ValidationContext,
	value: unknown,
	min = 1
): void {
	const { errors, path } = ctx;
	if (!Number.isInteger(value) || (value as number) < min) {
		err(ctx, `must be an integer ≥ ${min}`, value);
	}
}
