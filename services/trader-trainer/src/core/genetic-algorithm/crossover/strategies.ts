import type { CrossoverGenome } from "../genome-control";
import { CrossoverType } from "../genome-control";

export interface CrossoverStrategyContext {
	left: number;
	right: number;
	co: CrossoverGenome;
	rng: () => number;
}

type CrossoverFn = (ctx: CrossoverStrategyContext) => number;

function lerpNum(first: number, second: number, blend: number): number {
	return first + (second - first) * blend;
}

const CROSSOVER_STRATEGIES: Record<CrossoverGenome["type"], CrossoverFn> = {
	[CrossoverType.Arithmetic]: (ctx) => {
		const { left, right, co } = ctx;
		return lerpNum(left, right, co.blendAlpha);
	},
	[CrossoverType.Blend]: (ctx) => {
		const { left, right, co, rng } = ctx;
		const lo = Math.min(left, right);
		const hi = Math.max(left, right);
		const diff = hi - lo;
		return (
			lo - co.blendAlpha * diff + rng() * (diff + 2 * co.blendAlpha * diff)
		);
	},
	[CrossoverType.Sbx]: (ctx) => {
		const { left, right, co, rng } = ctx;
		const randomValue = rng();
		const beta =
			randomValue < 0.5
				? (2 * randomValue) ** (1 / (co.sbxEta + 1))
				: (1 / (2 * (1 - randomValue))) ** (1 / (co.sbxEta + 1));
		return 0.5 * ((1 + beta) * left + (1 - beta) * right);
	},
	[CrossoverType.Uniform]: (ctx) => {
		const { left, right, rng } = ctx;
		return rng() < 0.5 ? left : right;
	},
	[CrossoverType.OnePoint]: (ctx) => {
		const { left, right, rng } = ctx;
		return rng() < 0.5 ? left : right;
	},
	[CrossoverType.TwoPoint]: (ctx) => {
		const { left, right, rng } = ctx;
		return rng() < 0.5 ? left : right;
	},
};

export interface CrossoverScalarContext {
	left: number;
	right: number;
	co: CrossoverGenome;
	rng: () => number;
}

export function crossoverScalar(ctx: CrossoverScalarContext): number {
	const { left, right, co, rng } = ctx;
	const crossover = CROSSOVER_STRATEGIES[co.type];
	return crossover
		? crossover({ left, right, co, rng })
		: rng() < 0.5
			? left
			: right;
}
