import type { GaTelemetry } from "./ga-telemetry";
import type {
	GAControlGenome,
	GenomeFitnessMeta,
	LamarckGenome,
	MarketStep,
} from "./genome";
import type { BackendFactory } from "./rl-backend";
import type { DeepReadonly } from "./shared-types";

export interface WindowSet {
	id: string;
	/** FEATURE_SHARED_TRUNK: the symbol of this window; its head is swapped in around the window. */
	symbol?: string;
	train: MarketStep[];
	validation: MarketStep[];
	/**
	 * Newest steps, after the validation: read once, on the best genome after
	 * the session, never by the training nor the selection (ADR-0068).
	 */
	test?: MarketStep[];
}

export interface GARunnerConfig {
	windowSets: WindowSet[];
	backendFactory: BackendFactory;
	onGeneration?: (ctx: GenerationContext) => void;
	onArchiveUpdate?: (archive: DeepReadonly<LamarckGenome>[]) => void;
	initialControl?: Partial<GAControlGenome>;
	/** Observability hooks (no-op when omitted). */
	telemetry?: GaTelemetry;
	/** Aborted: the run ends after the current generation with its best genome so far (ADR-0058). */
	signal?: AbortSignal;
	/** FEATURE_EVENT_DRIVEN_DECISIONS: the population decides on market events. */
	eventDriven?: boolean;
	/** FEATURE_INPUT_MASK_GENE: names of the input groups the genome masks; absent: no mask gene. */
	inputGroups?: string[];
	/** FEATURE_SHARED_TRUNK: symbols each generation trains and evaluates on (rotating); absent: all. */
	symbolsPerGeneration?: number;
	/** The candle group stays active in every mask. */
	protectCandleGroup?: boolean;
}

export interface GenerationContext {
	generation: number;
	population: DeepReadonly<LamarckGenome>[];
	archive: DeepReadonly<LamarckGenome>[];
	bestFitness: number;
	bestGenome: DeepReadonly<LamarckGenome>;
	bestFitnessMeta?: GenomeFitnessMeta;
	avgFitness: number;
	efficiencyScore: number;
	elapsedMs: number;
	stagnation: number;
	gaControl: DeepReadonly<GAControlGenome>;
}
