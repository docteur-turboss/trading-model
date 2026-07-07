import type { CrossoverGenome } from "../genome-types";
import { CrossoverType } from "../genome-types";

export interface CrossoverStrategyContext {
	left: number;
	right: number;
	co: CrossoverGenome;
	rng: () => number;
}

export interface CrossoverStrategy {
	readonly type: CrossoverGenome["type"];
	crossover(ctx: CrossoverStrategyContext): number;
}

function lerpNum(first: number, second: number, blend: number): number {
	return first + (second - first) * blend;
}

class ArithmeticCrossover implements CrossoverStrategy {
	readonly type = CrossoverType.Arithmetic;

	crossover(ctx: CrossoverStrategyContext): number {
		const { left, right, co } = ctx;
		return lerpNum(left, right, co.blendAlpha);
	}
}

class BlendCrossover implements CrossoverStrategy {
	readonly type = CrossoverType.Blend;

	crossover(ctx: CrossoverStrategyContext): number {
		const { left, right, co, rng } = ctx;
		const lo = Math.min(left, right);
		const hi = Math.max(left, right);
		const diff = hi - lo;
		return (
			lo - co.blendAlpha * diff + rng() * (diff + 2 * co.blendAlpha * diff)
		);
	}
}

class SBXCrossover implements CrossoverStrategy {
	readonly type = CrossoverType.Sbx;

	crossover(ctx: CrossoverStrategyContext): number {
		const { left, right, co, rng } = ctx;
		const randomValue = rng();
		const beta =
			randomValue < 0.5
				? (2 * randomValue) ** (1 / (co.sbxEta + 1))
				: (1 / (2 * (1 - randomValue))) ** (1 / (co.sbxEta + 1));
		return 0.5 * ((1 + beta) * left + (1 - beta) * right);
	}
}

class UniformCrossover implements CrossoverStrategy {
	readonly type = CrossoverType.Uniform;

	crossover(ctx: CrossoverStrategyContext): number {
		const { left, right, rng } = ctx;
		return rng() < 0.5 ? left : right;
	}
}

class OnePointCrossover implements CrossoverStrategy {
	readonly type = CrossoverType.OnePoint;

	crossover(ctx: CrossoverStrategyContext): number {
		const { left, right, rng } = ctx;
		return rng() < 0.5 ? left : right;
	}
}

class TwoPointCrossover implements CrossoverStrategy {
	readonly type = CrossoverType.TwoPoint;

	crossover(ctx: CrossoverStrategyContext): number {
		const { left, right, rng } = ctx;
		return rng() < 0.5 ? left : right;
	}
}

const CROSSOVER_STRATEGIES: Record<CrossoverGenome["type"], CrossoverStrategy> =
	{
		[CrossoverType.Arithmetic]: new ArithmeticCrossover(),
		[CrossoverType.Blend]: new BlendCrossover(),
		[CrossoverType.Sbx]: new SBXCrossover(),
		[CrossoverType.Uniform]: new UniformCrossover(),
		[CrossoverType.OnePoint]: new OnePointCrossover(),
		[CrossoverType.TwoPoint]: new TwoPointCrossover(),
	};

export interface CrossoverScalarContext {
	left: number;
	right: number;
	co: CrossoverGenome;
	rng: () => number;
}

export function crossoverScalar(ctx: CrossoverScalarContext): number {
	const { left, right, co, rng } = ctx;
	const strategy = CROSSOVER_STRATEGIES[co.type];
	return strategy
		? strategy.crossover({ left, right, co, rng })
		: rng() < 0.5
			? left
			: right;
}
