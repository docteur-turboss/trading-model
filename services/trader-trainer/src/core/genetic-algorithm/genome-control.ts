import {
	type DurationMs,
	Fitness,
	Percentage,
	PositiveInt,
	Probability,
} from "@trading-model/common/domain/primitives";
import { type DeepReadonly, deepFreeze } from "./shared-types";

export enum CrossoverType {
	OnePoint = "one_point",
	TwoPoint = "two_point",
	Uniform = "uniform",
	Arithmetic = "arithmetic",
	Blend = "blend",
	Sbx = "sbx",
}

export interface CrossoverGenome {
	type: CrossoverType;
	probability: Probability;
	blendAlpha: Percentage;
	sbxEta: PositiveInt;
}

export enum SelectionType {
	Tournament = "tournament",
	Roulette = "roulette",
	Rank = "rank",
	Truncation = "truncation",
	Sus = "sus",
}

export enum FitnessType {
	TotalPnl = "total_pnl",
	Sharpe = "sharpe",
	Sortino = "sortino",
	Calmar = "calmar",
	Composite = "composite",
}

export interface GAPopulationConfig {
	size: PositiveInt;
	elitismFraction: Probability;
	survivorFraction: Probability;
}

export function eliteCount(config: GAPopulationConfig): number {
	return Math.max(1, Math.round(config.size * config.elitismFraction));
}

export function survivorCount(config: GAPopulationConfig): number {
	return Math.max(1, Math.round(config.size * config.survivorFraction));
}

export interface GATerminationConfig {
	rewardThreshold: Fitness;
	stagnationPatience: PositiveInt;
	maxGenerations: PositiveInt;
	timeBudgetMs: DurationMs;
}

export function shouldTerminateByReward(
	config: GATerminationConfig,
	bestFitness: Fitness
): boolean {
	return bestFitness >= config.rewardThreshold;
}

export function shouldTerminateByStagnation(
	config: GATerminationConfig,
	stagnationGenerations: number
): boolean {
	return stagnationGenerations >= config.stagnationPatience;
}

export function shouldTerminateByBudget(
	config: GATerminationConfig,
	startTimeMs: number
): boolean {
	return Date.now() - startTimeMs >= config.timeBudgetMs;
}

export interface GASeedingConfig {
	envSeed: number;
	mutationSeed: number;
	networkSeed: number;
}

export function toCombinedSeed(config: GASeedingConfig): number {
	return (
		((config.envSeed * 31 + config.mutationSeed) * 31 + config.networkSeed) | 0
	);
}

export interface GAEvaluationConfig {
	episodesPerIndividual: PositiveInt;
	seedsPerEval: PositiveInt;
}

export interface GAControlGenome {
	population: GAPopulationConfig;
	termination: GATerminationConfig;
	seeding: GASeedingConfig;
	evaluation: GAEvaluationConfig;
	selectionType: SelectionType;
	fitnessType: FitnessType;
	mutationRate: Percentage;
	mutationStd: Percentage;
}

export function createCrossoverGenome(): CrossoverGenome {
	return {
		type: CrossoverType.Uniform,
		probability: Probability.of(0.7),
		blendAlpha: Percentage.of(0.5),
		sbxEta: PositiveInt.of(2),
	};
}

export function createGAControlGenome(): GAControlGenome {
	return {
		population: {
			size: PositiveInt.of(20),
			elitismFraction: Probability.of(0.1),
			survivorFraction: Probability.of(0.5),
		},
		termination: {
			rewardThreshold: Fitness.of(Number.POSITIVE_INFINITY),
			stagnationPatience: PositiveInt.of(15),
			maxGenerations: PositiveInt.of(100),
			timeBudgetMs: 5 * 60 * 1_000,
		},
		seeding: {
			envSeed: 42,
			mutationSeed: 1337,
			networkSeed: 7,
		},
		evaluation: {
			episodesPerIndividual: PositiveInt.of(3),
			seedsPerEval: PositiveInt.of(2),
		},
		selectionType: SelectionType.Tournament,
		fitnessType: FitnessType.TotalPnl,
		mutationRate: Percentage.of(0.1),
		mutationStd: Percentage.of(0.05),
	} as GAControlGenome;
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

function isImproving(effHistory: number[]): boolean {
	const recent = effHistory.slice(-5);
	return recent[recent.length - 1] > recent[0];
}

function buildAdjustedControl(
	ctrl: DeepReadonly<GAControlGenome>,
	stagnation: number,
	isImproving: boolean
): GAControlGenome {
	return {
		...ctrl,
		population: {
			...ctrl.population,
			size: adjustPopulationSize(
				ctrl.population.size as unknown as number,
				stagnation,
				isImproving
			),
			elitismFraction: adjustElitism(
				ctrl.population.elitismFraction as unknown as number,
				stagnation,
				isImproving
			),
			survivorFraction: adjustSurvivors(
				ctrl.population.survivorFraction as unknown as number,
				stagnation
			),
		},
		evaluation: {
			...ctrl.evaluation,
			episodesPerIndividual: adjustEpisodes(
				ctrl.evaluation.episodesPerIndividual as unknown as number,
				stagnation,
				isImproving
			),
		},
	} as GAControlGenome;
}

export function adaptGAControl(
	ctrl: DeepReadonly<GAControlGenome>,
	effHistory: number[],
	stagnation: number
): DeepReadonly<GAControlGenome> {
	if (effHistory.length < 3) {
		return ctrl;
	}
	return deepFreeze(
		buildAdjustedControl(ctrl, stagnation, isImproving(effHistory))
	);
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

export function checkTerminationConditions(
	ctx: TerminationCheckContext
): StopCondition {
	const { generation, bestFitness, stagnation, elapsedMs, ctrl } = ctx;
	if (bestFitness >= (ctrl.termination.rewardThreshold as unknown as number)) {
		return { shouldStop: true, reason: "Reward threshold reached" };
	}
	if (
		stagnation >= (ctrl.termination.stagnationPatience as unknown as number)
	) {
		return { shouldStop: true, reason: "Stagnation patience exceeded" };
	}
	if (generation >= (ctrl.termination.maxGenerations as unknown as number)) {
		return { shouldStop: true, reason: "Max generations reached" };
	}
	if (elapsedMs >= ctrl.termination.timeBudgetMs) {
		return { shouldStop: true, reason: "Time budget exceeded" };
	}
	return { shouldStop: false };
}
