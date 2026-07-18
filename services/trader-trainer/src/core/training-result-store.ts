import type { GenerationContext } from "./genetic-algorithm/ga-runner";
import type { TradingSymbol } from "./market-data-types";
import { type BestAgentSummary, LastTrainingInfo } from "./training-state";
import type { TrainingSuccess } from "./training-types";

export class TrainingResultStore {
	private _lastSuccess: LastTrainingInfo | null = null;

	store(value: TrainingSuccess): void {
		this._lastSuccess = new LastTrainingInfo(
			value.symbol,
			value.bestGenome,
			value.bestFitness,
			value.bestFitnessMeta,
			value.generation,
			value.generationContext
		);
	}

	getSymbol(): TradingSymbol {
		return this._lastSuccess?.symbol ?? ("" as TradingSymbol);
	}

	getGeneration(): number {
		return this._lastSuccess?.generation ?? 0;
	}

	getGenerationContext(): GenerationContext | null {
		return this._lastSuccess?.generationContext ?? null;
	}

	buildBestAgentSummary(): BestAgentSummary | null {
		if (!this._lastSuccess) {
			return null;
		}
		return this._lastSuccess.buildBestAgentSummary();
	}
}
