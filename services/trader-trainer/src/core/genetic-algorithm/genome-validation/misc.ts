import type {
	CrossoverGenome,
	GAControlGenome,
	Genome,
	MutationGenome,
	ValidationContext,
} from "../genome";
import { clamp } from "../utils";
import { checkPositiveInt, checkRange, err } from "./utils";

export function validateMutation(
	ctx: ValidationContext,
	mutation: MutationGenome
): void {
	checkRange({ ...ctx, path: "mutation.rate" }, mutation.rate, 0.001, 0.5);
	checkRange({ ...ctx, path: "mutation.sigma" }, mutation.sigma, 1e-5, 10);
	checkRange(
		{ ...ctx, path: "mutation.selfSigma" },
		mutation.selfSigma,
		1e-5,
		10
	);
}

export function validateCrossover(
	ctx: ValidationContext,
	crossover: CrossoverGenome
): void {
	checkRange(
		{ ...ctx, path: "crossover.probability" },
		crossover.probability,
		0,
		1
	);
	checkRange(
		{ ...ctx, path: "crossover.blendAlpha" },
		crossover.blendAlpha,
		0,
		1
	);
	checkRange({ ...ctx, path: "crossover.sbxEta" }, crossover.sbxEta, 1, 100);
}

export function validateGAControl(
	ctx: ValidationContext,
	ga: GAControlGenome
): void {
	checkPositiveInt(
		{ ...ctx, path: "gaControl.populationSize" },
		ga.populationSize,
		2
	);
	checkRange(
		{ ...ctx, path: "gaControl.elitismFraction" },
		ga.elitismFraction,
		0,
		1
	);
	checkRange(
		{ ...ctx, path: "gaControl.survivorFraction" },
		ga.survivorFraction,
		0,
		1
	);
	checkPositiveInt(
		{ ...ctx, path: "gaControl.maxGenerations" },
		ga.maxGenerations
	);
	checkPositiveInt(
		{ ...ctx, path: "gaControl.episodesPerIndividual" },
		ga.episodesPerIndividual
	);
}

function repairMutation(mutation: MutationGenome): MutationGenome {
	return {
		...mutation,
		rate: clamp(mutation.rate ?? 0.1, 0.001, 0.5),
		sigma: Math.max(1e-5, mutation.sigma ?? 0.05),
		selfSigma: Math.max(1e-5, mutation.selfSigma ?? 0.05),
	};
}

function repairCrossover(crossover: CrossoverGenome): CrossoverGenome {
	return {
		...crossover,
		probability: clamp(crossover.probability ?? 0.7, 0, 1),
		blendAlpha: clamp(crossover.blendAlpha ?? 0.5, 0, 1),
		sbxEta: Math.max(1, crossover.sbxEta ?? 2),
	};
}

function repairGAControl(gaControl: GAControlGenome): GAControlGenome {
	return {
		...gaControl,
		populationSize: Math.max(2, Math.round(gaControl.populationSize ?? 20)),
		elitismFraction: clamp(gaControl.elitismFraction ?? 0.1, 0, 1),
		survivorFraction: clamp(gaControl.survivorFraction ?? 0.5, 0, 1),
		episodesPerIndividual: Math.max(
			1,
			Math.round(gaControl.episodesPerIndividual ?? 3)
		),
		maxGenerations: Math.max(1, Math.round(gaControl.maxGenerations ?? 100)),
	};
}

function validateIdentity(ctx: ValidationContext, genome: Genome): void {
	if (typeof genome.id !== "string" || genome.id.length === 0) {
		err({ ...ctx, path: "id" }, "must be a non-empty string", genome.id);
	}
	if (!Number.isInteger(genome.generation) || genome.generation < 0) {
		err(
			{ ...ctx, path: "generation" },
			"must be a non-negative integer",
			genome.generation
		);
	}
}

export { repairCrossover, repairGAControl, repairMutation, validateIdentity };
