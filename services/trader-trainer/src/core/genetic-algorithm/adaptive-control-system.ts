/**
 * AdaptiveControlSystem: Self-adaptive GA control parameters.
 * Adjusts population size, elitism, survival rate, and episodes based on
 * stagnation and improvement history.
 */

import type { GAControlGenome } from "./genome-types";

type DeepReadonly<TValue> = TValue extends (infer UItem)[]
	? readonly DeepReadonly<UItem>[]
	: TValue extends object
		? { readonly [KKey in keyof TValue]: DeepReadonly<TValue[KKey]> }
		: TValue;

function deepFreeze<TValue>(obj: TValue): DeepReadonly<TValue> {
	if (obj === null || typeof obj !== "object") {
		return obj as DeepReadonly<TValue>;
	}

	for (const key of Object.keys(obj)) {
		const val = (obj as Record<string, unknown>)[key];
		if (val !== null && typeof val === "object" && !Object.isFrozen(val)) {
			deepFreeze(val);
		}
	}

	return Object.freeze(obj) as DeepReadonly<TValue>;
}

function adjustPopulationSize(
	popSize: number,
	stagnation: number,
	isImproving: boolean
): number {
	if (stagnation > 5 && popSize < 80) {
		return Math.min(80, popSize + 2);
	}
	if (isImproving && popSize > 8) {
		return Math.max(8, popSize - 1);
	}
	return popSize;
}

function adjustElitism(
	elitism: number,
	stagnation: number,
	isImproving: boolean
): number {
	if (stagnation > 8) {
		return Math.min(0.3, elitism + 0.02);
	}
	if (isImproving) {
		return Math.max(0.05, elitism - 0.01);
	}
	return elitism;
}

function adjustSurvivors(survivors: number, stagnation: number): number {
	if (stagnation > 10) {
		return Math.min(0.9, survivors + 0.05);
	}
	return survivors;
}

function adjustEpisodes(
	eps: number,
	stagnation: number,
	isImproving: boolean
): number {
	if (stagnation > 6 && eps < 10) {
		return eps + 1;
	}
	if (isImproving && eps > 2) {
		return eps - 1;
	}
	return eps;
}

/**
 * Adapt GA control parameters based on efficiency history and stagnation.
 * Increases exploration (pop size) when stagnating, decreases when improving.
 * Increases exploitation (elitism, episodes) when stagnating.
 */
function _isImproving(effHistory: number[]): boolean {
	const recent = effHistory.slice(-5);
	return recent[recent.length - 1] > recent[0];
}

function _buildAdjustedControl(
	ctrl: DeepReadonly<GAControlGenome>,
	stagnation: number,
	isImproving: boolean
): GAControlGenome {
	return {
		...ctrl,
		populationSize: adjustPopulationSize(ctrl.populationSize, stagnation, isImproving),
		elitismFraction: adjustElitism(ctrl.elitismFraction, stagnation, isImproving),
		survivorFraction: adjustSurvivors(ctrl.survivorFraction, stagnation),
		episodesPerIndividual: adjustEpisodes(ctrl.episodesPerIndividual, stagnation, isImproving),
	} as GAControlGenome;
}

export function adaptGAControl(
	ctrl: DeepReadonly<GAControlGenome>,
	effHistory: number[],
	stagnation: number
): Readonly<GAControlGenome> {
	if (effHistory.length < 3) {
		return ctrl;
	}
	return deepFreeze(_buildAdjustedControl(ctrl, stagnation, _isImproving(effHistory)));
}

export type StopCondition =
	| { shouldStop: true; reason: string }
	| { shouldStop: false };

export interface TerminationCheckContext {
	generation: number;
	bestFitness: number;
	stagnation: number;
	elapsedMs: number;
	ctrl: DeepReadonly<GAControlGenome>;
}

/**
 * Check if any termination condition is met.
 */
export function checkTerminationConditions(
	ctx: TerminationCheckContext
): StopCondition {
	const { generation, bestFitness, stagnation, elapsedMs, ctrl } = ctx;
	if (bestFitness >= ctrl.rewardThreshold) {
		return { shouldStop: true, reason: "Reward threshold reached" };
	}
	if (stagnation >= ctrl.stagnationPatience) {
		return { shouldStop: true, reason: "Stagnation patience exceeded" };
	}
	if (generation >= ctrl.maxGenerations) {
		return { shouldStop: true, reason: "Max generations reached" };
	}
	if (elapsedMs >= ctrl.timeBudgetMs) {
		return { shouldStop: true, reason: "Time budget exceeded" };
	}
	return { shouldStop: false };
}
