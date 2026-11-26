import type { MarketStep } from "../src/domain/genetic-algorithm/genome";
import { EMBARGO_STEPS } from "../src/domain/market-data/window-splitter";

/** Value of `--name` in `argv`, else `fallback`; throws when neither exists. */
export function arg(
	name: string,
	fallback?: string,
	argv: string[] = process.argv
): string {
	const idx = argv.indexOf(`--${name}`);
	const value = idx >= 0 ? argv[idx + 1] : fallback;
	if (value === undefined) {
		throw new Error(`missing --${name}`);
	}
	return value;
}

export function mean(values: number[]): number {
	return values.length === 0
		? 0
		: values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** 80 % train, then an embargo, then validation. */
export function splitTrainValidation(steps: MarketStep[]): {
	train: MarketStep[];
	validation: MarketStep[];
} {
	const split = Math.floor(steps.length * 0.8);
	return {
		train: steps.slice(0, split),
		validation: steps.slice(split + EMBARGO_STEPS),
	};
}
