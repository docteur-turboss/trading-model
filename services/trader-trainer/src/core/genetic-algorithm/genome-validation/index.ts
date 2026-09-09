import type {
	GenomeId,
	PositiveInt,
} from "@trading-model/common/domain/primitives";
import type {
	Genome,
	ValidationContext,
	ValidationError,
	ValidationResult,
} from "../genome";
import { GENOME_SECTIONS } from "../genome-sections";
import {
	repairCrossover,
	repairGAControl,
	repairMutation,
	validateCrossover,
	validateGAControl,
	validateIdentity,
	validateMutation,
} from "./misc";

export function validateGenome(genome: Genome): ValidationResult {
	const errors: ValidationError[] = [];
	const ctx: ValidationContext = { errors, path: "" };
	validateIdentity(ctx, genome);
	GENOME_SECTIONS.network.validate(ctx, genome.network);
	GENOME_SECTIONS.rl.validate(ctx, genome.rl);
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
				: ("repaired" as unknown as GenomeId),
		generation: Math.max(0, Math.round(genome.generation ?? 0)) as PositiveInt,
		network: GENOME_SECTIONS.network.repair(genome.network),
		rl: GENOME_SECTIONS.rl.repair(genome.rl),
		mutation: repairMutation(genome.mutation),
		crossover: repairCrossover(genome.crossover),
		gaControl: repairGAControl(genome.gaControl),
	};
}
