import { FEATURE_DIM } from "@trading-model/model-runtime/feature-vector-codec";

/** Inputs per signal metric: value, age, confidence (ADR-0081). */
const SIGNAL_INPUTS = 3;
/** Candle fields 0-8, then the sliding window 9-16, the bias at 17. */
const WINDOW_START = 9;
const BIAS_INDEX = FEATURE_DIM - 1;
const INPUT_MASK_MUTATION_RATE = 0.05;

/** Group names of the mask: candle (with the bias), sliding window, one per signal key (ADR-0082). */
export function inputGroupNames(signalKeys: readonly string[]): string[] {
	return ["candle", "window", ...signalKeys];
}

function groupOf(index: number): number {
	if (index >= FEATURE_DIM) {
		return 2 + Math.floor((index - FEATURE_DIM) / SIGNAL_INPUTS);
	}
	return index >= WINDOW_START && index < BIAS_INDEX ? 1 : 0;
}

/** A copy of the market inputs with every masked group set to 0; `mask` absent: the inputs themselves. */
export function applyInputMask(
	input: Float32Array,
	mask: readonly boolean[] | undefined
): Float32Array {
	if (!mask) {
		return input;
	}
	return input.map((value, index) => (mask[groupOf(index)] ? value : 0));
}

/** Per group, from either parent; never all off. */
export function crossoverInputMask(
	left: readonly boolean[],
	right: readonly boolean[],
	rng: () => number
): boolean[] {
	return keepOneActive(
		left.map((on, group) => (rng() < 0.5 ? on : right[group])),
		left
	);
}

/** Flips each group with a small probability; never all off. */
export function mutateInputMask(
	mask: readonly boolean[],
	rng: () => number
): boolean[] {
	return keepOneActive(
		mask.map((on) => (rng() < INPUT_MASK_MUTATION_RATE ? !on : on)),
		mask
	);
}

function keepOneActive(
	next: boolean[],
	fallback: readonly boolean[]
): boolean[] {
	return next.some(Boolean) ? next : [...fallback];
}
