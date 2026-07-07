import type { GenerationContext } from "./genetic-algorithm/ga-runner";
import type { DeepReadonly } from "./genetic-algorithm/shared-types";
import { GenomeSummaryBuilder } from "./genome-summary-builder";
import type { BestAgentSummary, LastTrainingInfo } from "./training-state";

export class LastTrainingInfoHolder {
	private _lastInfo: LastTrainingInfo | null = null;
	private readonly _summaryBuilder = new GenomeSummaryBuilder();

	update(info: LastTrainingInfo): void {
		this._lastInfo = info;
	}

	getCurrentSymbol(): LastTrainingInfo["symbol"] | undefined {
		return this._lastInfo?.symbol;
	}

	getGeneration(): number | undefined {
		return this._lastInfo?.generation;
	}

	getGenerationContext(): GenerationContext | null | undefined {
		return this._lastInfo?.generationContext;
	}

	getBestAgentSummary(): BestAgentSummary | null {
		if (!this._lastInfo) {
			return null;
		}
		return this._summaryBuilder.buildBestAgentSummary(
			this._lastInfo.bestGenome
		);
	}
}
