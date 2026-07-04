// ================================================================
//   genome_types.ts — Re-exports from the canonical types file
//   and adds GA-specific runtime types
// ================================================================

// Re-export everything from the project's genome definitions.
// Adjust the import path to match your monorepo structure.
export * from "./genome"; // <- points to the provided genome_types file

// ---- Additional runtime types not in the static schema ----

export interface EpisodeLog {
	genomeId: string;
	episode: number;
	reward: number;
	steps: number;
	pnl: number;
	computeMs: number;
}

export interface GenerationSummary {
	generation: number;
	bestFitness: number;
	avgFitness: number;
	efficiency: number;
	popSize: number;
	stagnation: number;
	elapsedMs: number;
	gaControl: import("./genome").GAControlGenome;
}
