import type { CandleData } from "@trading-model/contracts/market-data.types";
import { candleHandler } from "./data-handlers/candle-handler";
import type { DataType } from "./data-handlers/data-types";
import type { SymbolNormalizers, SymbolState } from "./market-data-types";

export class NormalizationManager {
	createNormStats(): SymbolNormalizers {
		return candleHandler.createNorms() as SymbolNormalizers;
	}

	updateNorms(
		_dataType: DataType,
		state: Pick<SymbolState, "norm">,
		data: unknown
	): void {
		candleHandler.updateNorms(state, data as CandleData);
	}
}
