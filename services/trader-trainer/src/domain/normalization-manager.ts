import type { CandleData } from "@trading-model/contracts/market-data.types";
import { candleHandler } from "./data-handlers/candle-handler";
import type { SymbolNormalizers, SymbolState } from "./market-data-types";

export class NormalizationManager {
	createNormStats(): SymbolNormalizers {
		return candleHandler.createNorms() as SymbolNormalizers;
	}

	updateNorms(state: Pick<SymbolState, "norm">, data: CandleData): void {
		candleHandler.updateNorms(state, data);
	}
}
