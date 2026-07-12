export * from "./genome";

import type {
	Cash,
	DurationMs,
	Fitness,
	GenomeId,
	PositiveInt,
	Ratio,
	Reward,
} from "@trading-model/common/domain/primitives";

export interface EpisodeLog {
	genomeId: GenomeId;
	episode: number;
	reward: Reward;
	steps: number;
	pnl: Cash;
	computeMs: DurationMs;
}

export interface GenerationSummary {
	generation: PositiveInt;
	bestFitness: Fitness;
	avgFitness: Fitness;
	efficiency: Ratio;
	popSize: PositiveInt;
	stagnation: PositiveInt;
	elapsedMs: DurationMs;
	gaControl: import("./genome").GAControlGenome;
}
