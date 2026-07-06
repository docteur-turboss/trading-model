import type {
	GAControlGenome,
	LamarckGenome,
	MarketStep,
} from "./genome-types";
import type { BackendFactory } from "./rl-backend";
import type { DeepReadonly } from "./shared-types";

export interface WindowSet {
	id: string;
	train: MarketStep[];
	validation: MarketStep[];
}

export interface GARunnerConfig {
	windowSets: WindowSet[];
	backendFactory: BackendFactory;
	evalConcurrency?: number;
	onGeneration?: (ctx: GenerationContext) => void;
	onArchiveUpdate?: (archive: DeepReadonly<LamarckGenome>[]) => void;
	initialControl?: Partial<GAControlGenome>;
}

export interface GenerationContext {
	generation: number;
	population: DeepReadonly<LamarckGenome>[];
	archive: DeepReadonly<LamarckGenome>[];
	bestFitness: number;
	bestGenome: DeepReadonly<LamarckGenome>;
	avgFitness: number;
	efficiencyScore: number;
	elapsedMs: number;
	stagnation: number;
	gaControl: DeepReadonly<GAControlGenome>;
}
