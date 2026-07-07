import type {
	Genome,
	ValidationContext,
	ValidationError,
	ValidationResult,
} from "../genome";
import {
	repairCrossover,
	repairGAControl,
	repairMutation,
	validateCrossover,
	validateGAControl,
	validateIdentity,
	validateMutation,
} from "./misc";
import { repairNetwork, validateNetwork } from "./network";
import { repairRL, validateRL } from "./rl";

export function validateGenome(genome: Genome): ValidationResult {
	const errors: ValidationError[] = [];
	const ctx: ValidationContext = { errors, path: "" };
	validateIdentity(ctx, genome);
	validateNetwork(ctx, genome.network);
	validateRL(ctx, genome.rl);
	validateMutation(ctx, genome.mutation);
	validateCrossover(ctx, genome.crossover);
	validateGAControl(ctx, genome.gaControl);
	return { valid: errors.length === 0, errors };
}

export function repairGenome(genome: Genome): Genome {
	return {
		id:
			typeof genome.id === "string" && genome.id.length > 0
				? genome.id
				: "repaired",
		generation: Math.max(0, Math.round(genome.generation ?? 0)),
		network: repairNetwork(genome.network),
		rl: repairRL(genome.rl),
		mutation: repairMutation(genome.mutation),
		crossover: repairCrossover(genome.crossover),
		gaControl: repairGAControl(genome.gaControl),
	};
}
