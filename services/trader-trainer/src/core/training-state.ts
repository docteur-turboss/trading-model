import type { GenerationContext } from "./genetic-algorithm/ga-runner";
import type {
	ActivationType,
	FitnessType,
	SelectionType,
} from "./genetic-algorithm/genome";
import type { LamarckGenome } from "./genetic-algorithm/genome-types";
import type { DeepReadonly } from "./genetic-algorithm/shared-types";
import type { TradingSymbol } from "./market-data-types";
import { LastTrainingInfoHolder } from "./last-training-info-holder";

/** Summary of the best trained agent for API responses. */
export interface BestAgentSummary {
	id: string;
	generation: number;
	fitness: number;
	sharpe: number;
	avgPnl: number;
	negFlops: number;
	complexityPenalty: number;
	gaControl: {
		populationSize: number;
		elitismFraction: number;
		survivorFraction: number;
		episodesPerIndividual: number;
		selectionType: SelectionType;
		fitnessType: FitnessType;
	};
	network: {
		inputDim: number;
		outputDim: number;
		hiddenLayers: { neurons: number; activation: ActivationType }[];
	};
	rl: {
		gamma: number;
		learningRate: number;
		epsilonStart: number;
		epsilonMin: number;
		epsilonDecay: number;
	};
}

export interface LastTrainingInfo {
	symbol: TradingSymbol;
	bestGenome: DeepReadonly<LamarckGenome>;
	generation: number;
	generationContext: GenerationContext | null;
}

export class TrainingState {
	private readonly _lastInfoHolder = new LastTrainingInfoHolder();

	update(info: LastTrainingInfo): void {
		this._lastInfoHolder.update(info);
	}

	getCurrentSymbol(): TradingSymbol | undefined {
		return this._lastInfoHolder.getCurrentSymbol();
	}

	getGeneration(): number | undefined {
		return this._lastInfoHolder.getGeneration();
	}

	getGenerationContext(): GenerationContext | null | undefined {
		return this._lastInfoHolder.getGenerationContext();
	}

	getBestAgentSummary(): BestAgentSummary | null {
		return this._lastInfoHolder.getBestAgentSummary();
	}
}
