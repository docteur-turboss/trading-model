import type {
	Percentage,
	PositiveInt,
	Probability,
} from "@trading-model/common/domain/primitives";
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
	checkRange({ ...ctx, path: "mutation.rates.rate" }, mutation.rates.rate, {
		min: 0.001,
		max: 0.5,
	});
	checkRange({ ...ctx, path: "mutation.rates.sigma" }, mutation.rates.sigma, {
		min: 1e-5,
		max: 10,
	});
	checkRange(
		{ ...ctx, path: "mutation.rates.selfSigma" },
		mutation.rates.selfSigma,
		{ min: 1e-5, max: 10 }
	);
}

export function validateCrossover(
	ctx: ValidationContext,
	crossover: CrossoverGenome
): void {
	checkRange({ ...ctx, path: "crossover.probability" }, crossover.probability, {
		min: 0,
		max: 1,
	});
	checkRange({ ...ctx, path: "crossover.blendAlpha" }, crossover.blendAlpha, {
		min: 0,
		max: 1,
	});
	checkRange({ ...ctx, path: "crossover.sbxEta" }, crossover.sbxEta, {
		min: 1,
		max: 100,
	});
}

export function validateGAControl(
	ctx: ValidationContext,
	ga: GAControlGenome
): void {
	checkPositiveInt(
		{ ...ctx, path: "gaControl.population.size" },
		ga.population.size,
		{ min: 2 }
	);
	checkRange(
		{ ...ctx, path: "gaControl.population.elitismFraction" },
		ga.population.elitismFraction,
		{ min: 0, max: 1 }
	);
	checkRange(
		{ ...ctx, path: "gaControl.population.survivorFraction" },
		ga.population.survivorFraction,
		{ min: 0, max: 1 }
	);
	checkPositiveInt(
		{ ...ctx, path: "gaControl.termination.maxGenerations" },
		ga.termination.maxGenerations
	);
	checkPositiveInt(
		{ ...ctx, path: "gaControl.evaluation.episodesPerIndividual" },
		ga.evaluation.episodesPerIndividual
	);
}

function repairMutation(mutation: MutationGenome): MutationGenome {
	return {
		...mutation,
		rates: {
			...mutation.rates,
			rate: clamp(mutation.rates.rate ?? 0.1, 0.001, 0.5) as Percentage,
			sigma: Math.max(1e-5, mutation.rates.sigma ?? 0.05) as Percentage,
			selfSigma: Math.max(1e-5, mutation.rates.selfSigma ?? 0.05) as Percentage,
		},
	};
}

function repairCrossover(crossover: CrossoverGenome): CrossoverGenome {
	return {
		...crossover,
		probability: clamp(crossover.probability ?? 0.7, 0, 1) as Probability,
		blendAlpha: clamp(crossover.blendAlpha ?? 0.5, 0, 1) as Percentage,
		sbxEta: Math.max(1, crossover.sbxEta ?? 2) as PositiveInt,
	};
}

function repairGAControl(gaControl: GAControlGenome): GAControlGenome {
	return {
		...gaControl,
		population: {
			...gaControl.population,
			size: Math.max(
				2,
				Math.round(gaControl.population.size ?? 20)
			) as PositiveInt,
			elitismFraction: clamp(
				gaControl.population.elitismFraction ?? 0.1,
				0,
				1
			) as Probability,
			survivorFraction: clamp(
				gaControl.population.survivorFraction ?? 0.5,
				0,
				1
			) as Probability,
		},
		termination: {
			...gaControl.termination,
			maxGenerations: Math.max(
				1,
				Math.round(gaControl.termination.maxGenerations ?? 100)
			) as PositiveInt,
		},
		evaluation: {
			...gaControl.evaluation,
			episodesPerIndividual: Math.max(
				1,
				Math.round(gaControl.evaluation.episodesPerIndividual ?? 3)
			) as PositiveInt,
		},
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
