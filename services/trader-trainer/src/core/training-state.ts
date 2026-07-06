import type { GenerationContext } from "./genetic-algorithm/ga-runner";
import type {
	ActivationType,
	FitnessType,
	SelectionType,
} from "./genetic-algorithm/genome";
import type { LamarckGenome } from "./genetic-algorithm/genome-types";
import type { DeepReadonly } from "./genetic-algorithm/shared-types";
import { GenomeSummaryBuilder } from "./genome-summary-builder";
import type { TradingSymbol } from "./market-data-types";

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

const NULL_TRAINING_INFO: LastTrainingInfo = {
	symbol: "" as TradingSymbol,
	bestGenome: undefined as unknown as DeepReadonly<LamarckGenome>,
	generation: 0,
	generationContext: null,
};

export class TrainingState {
	private _lastInfo: LastTrainingInfo = NULL_TRAINING_INFO;
	private readonly _summaryBuilder = new GenomeSummaryBuilder();

	update(info: LastTrainingInfo): void {
		this._lastInfo = info;
	}

	getCurrentSymbol(): TradingSymbol {
		return this._lastInfo.symbol;
	}

	getGeneration(): number {
		return this._lastInfo.generation;
	}

	getGenerationContext(): GenerationContext | null {
		return this._lastInfo.generationContext;
	}

	getBestAgentSummary(): BestAgentSummary | null {
		if (this._lastInfo.bestGenome === undefined) {
			return null;
		}

		return this._summaryBuilder.buildBestAgentSummary(
			this._lastInfo.bestGenome
		);
	}
}
