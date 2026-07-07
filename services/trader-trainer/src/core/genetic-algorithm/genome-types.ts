export * from "./genome";

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
