export * from "./genome";

import type {
	Cash,
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
	computeMs: number;
}

export interface GenerationSummary {
	generation: PositiveInt;
	bestFitness: Fitness;
	avgFitness: Fitness;
	efficiency: Ratio;
	popSize: PositiveInt;
	stagnation: PositiveInt;
	elapsedMs: number;
	gaControl: import("./genome").GAControlGenome;
}
